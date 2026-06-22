import * as path from 'node:path'
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib'
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2'
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as logs from 'aws-cdk-lib/aws-logs'
import type { Construct } from 'constructs'

export interface EvoTestappStackProps extends StackProps {
  stage: string
}

/**
 * evo 監視対象サンプル: API Gateway (HTTP API) → Lambda → DynamoDB。
 * observability（構造化ログ・標準メトリクス・CloudWatch アラーム）を備える。
 * 全リソースのタグ付け（evo-target:true）は bin/app.ts の App レベルで行う。
 */
export class EvoTestappStack extends Stack {
  constructor(scope: Construct, id: string, props: EvoTestappStackProps) {
    super(scope, id, props)

    const prefix = 'sampleapp'
    const distPath = path.resolve(process.cwd(), 'dist')

    // --- DynamoDB ---------------------------------------------------------
    const table = new dynamodb.Table(this, 'TodosTable', {
      tableName: `${prefix}-todos`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY, // サンプルのため破棄可
    })

    // --- Lambda -----------------------------------------------------------
    // ログ保持を明示。Lambda はこの LogGroup に構造化ログ（JSON 1行）を出す。
    const logGroup = new logs.LogGroup(this, 'ApiFnLogGroup', {
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.DESTROY,
    })

    const apiFn = new lambda.Function(this, 'ApiFn', {
      functionName: `${prefix}-api`,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler.handler',
      code: lambda.Code.fromAsset(distPath), // tsup の出力。synth 前に `pnpm build` が必要。
      memorySize: 256,
      timeout: Duration.seconds(10),
      logGroup,
      environment: {
        TABLE_NAME: table.tableName,
        SERVICE_NAME: 'evo-testapp',
        STAGE: props.stage,
        LOG_LEVEL: 'info',
        // フォルトインジェクション（平常 OFF）。evo 検証時に ON にするとエラー増→アラーム発報を再現できる。
        FAULT_NULL_DEREF: 'false',
        FAULT_LATENCY_MS: '0',
        FAULT_ERROR_RATE: '0',
        FAULT_DYNAMO_FAIL: 'false',
      },
    })
    table.grantReadWriteData(apiFn)

    // --- API Gateway (HTTP API) ------------------------------------------
    const integration = new HttpLambdaIntegration('ApiIntegration', apiFn)
    const httpApi = new HttpApi(this, 'HttpApi', {
      apiName: `${prefix}-http-api`,
      description: 'evo-testapp ToDo HTTP API',
      createDefaultStage: true,
    })

    const routes: ReadonlyArray<{ path: string; method: HttpMethod }> = [
      { path: '/todos', method: HttpMethod.POST },
      { path: '/todos', method: HttpMethod.GET },
      { path: '/todos/{id}', method: HttpMethod.GET },
      { path: '/todos/{id}', method: HttpMethod.PUT },
      { path: '/todos/{id}', method: HttpMethod.DELETE },
    ]
    for (const route of routes) {
      httpApi.addRoutes({ path: route.path, methods: [route.method], integration })
    }

    // --- CloudWatch Alarms（incident トリガ。名前は分かりやすく） ----------
    new cloudwatch.Alarm(this, 'LambdaErrorsAlarm', {
      alarmName: `${prefix}-lambda-errors`,
      alarmDescription: 'Lambda 関数の Errors が発生（evo incident トリガ）',
      metric: apiFn.metricErrors({ period: Duration.minutes(1), statistic: 'Sum' }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    })

    new cloudwatch.Alarm(this, 'LambdaThrottlesAlarm', {
      alarmName: `${prefix}-lambda-throttles`,
      alarmDescription: 'Lambda 関数が Throttle された（容量・並行性の問題）',
      metric: apiFn.metricThrottles({ period: Duration.minutes(1), statistic: 'Sum' }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    })

    new cloudwatch.Alarm(this, 'ApiServerErrorAlarm', {
      alarmName: `${prefix}-api-5xx`,
      alarmDescription: 'API Gateway が 5XX を返している（サーバ側障害）',
      metric: httpApi.metricServerError({ period: Duration.minutes(1), statistic: 'Sum' }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    })

    new cloudwatch.Alarm(this, 'ApiLatencyP99Alarm', {
      alarmName: `${prefix}-api-latency-p99`,
      alarmDescription: 'API Gateway のレイテンシ p99 が閾値を超過（性能劣化）',
      metric: httpApi.metricLatency({ period: Duration.minutes(1), statistic: 'p99' }),
      threshold: 3000, // ms
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    })

    // --- Outputs ----------------------------------------------------------
    new CfnOutput(this, 'ApiUrl', {
      value: httpApi.apiEndpoint,
      description: 'HTTP API のベース URL',
    })
    new CfnOutput(this, 'TableName', { value: table.tableName })
    new CfnOutput(this, 'FunctionName', { value: apiFn.functionName })
  }
}
