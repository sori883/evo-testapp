import { App, Tags } from 'aws-cdk-lib'
import { EvoTestappStack } from '../lib/evo-testapp-stack.js'

const app = new App()

const stage = (app.node.tryGetContext('stage') as string | undefined) ?? process.env.STAGE ?? 'dev'

new EvoTestappStack(app, 'EvoTestappStack', {
  stackName: `evo-testapp-${stage}`,
  stage,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    // 連携契約(MUST): 同一リージョン ap-northeast-1 に固定する。
    region: 'ap-northeast-1',
  },
  description: 'evo 監視対象サンプル: ToDo API (API GW HTTP API -> Lambda -> DynamoDB)',
})

// 連携契約(MUST): 全 AWS リソースに evo-target:true タグを付与する（App レベルで全 stack/resource に伝播）。
Tags.of(app).add('evo-target', 'true')
Tags.of(app).add('app', 'evo-testapp')
