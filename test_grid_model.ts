import * as tf from "@tensorflow/tfjs-node";

async function testModel() {
  console.log("Testing Grid PPO Model (20 state, 5 actions)...");
  
  const modelPath = "/opt/binance-bot/ml_models/grid_ppo_best";
  
  const actor = await tf.loadLayersModel(`file://${modelPath}/actor/model.json`);
  const critic = await tf.loadLayersModel(`file://${modelPath}/critic/model.json`);
  
  console.log("✅ Models loaded");
  console.log(`   Actor: ${actor.inputs[0].shape} -> ${actor.outputs[0].shape}`);
  console.log(`   Critic: ${critic.inputs[0].shape} -> ${critic.outputs[0].shape}`);
  
  const testState = tf.randomNormal([1, 20]);
  const actionProbs = actor.predict(testState) as tf.Tensor;
  const value = critic.predict(testState) as tf.Tensor;
  
  const probsData = await actionProbs.data();
  const valueData = await value.data();
  
  console.log("✅ Inference test passed");
  console.log(`   Action probs: [${Array.from(probsData).map(p => p.toFixed(3)).join(", ")}]`);
  console.log(`   State value: ${valueData[0].toFixed(3)}`);
  
  testState.dispose();
  actionProbs.dispose();
  value.dispose();
  
  console.log("✅ Model ready for deployment!");
}

testModel().catch(console.error);
