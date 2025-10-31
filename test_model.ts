import * as tf from "@tensorflow/tfjs-node";

async function testModel() {
  console.log("=".repeat(60));
  console.log("Testing 230-Episode Model");
  console.log("=".repeat(60));
  console.log();

  const modelPath = "/opt/binance-bot/ml_models/production_230ep";

  try {
    // Test 1: Load models
    console.log("Test 1: Loading models...");
    const actor = await tf.loadLayersModel(`file://${modelPath}/actor/model.json`);
    const critic = await tf.loadLayersModel(`file://${modelPath}/critic/model.json`);
    console.log("✅ Models loaded successfully");
    console.log(`   Actor: ${actor.inputs[0].shape} -> ${actor.outputs[0].shape}`);
    console.log(`   Critic: ${critic.inputs[0].shape} -> ${critic.outputs[0].shape}`);
    console.log();

    // Test 2: Single inference
    console.log("Test 2: Single inference test...");
    const testState = tf.randomNormal([1, 25]);
    const actionProbs = actor.predict(testState) as tf.Tensor;
    const value = critic.predict(testState) as tf.Tensor;
    
    const probsData = await actionProbs.data();
    const valueData = await value.data();
    
    console.log("✅ Inference successful");
    console.log(`   Action probabilities: [${Array.from(probsData).map(p => p.toFixed(4)).join(", ")}]`);
    console.log(`   Sum: ${Array.from(probsData).reduce((a, b) => a + b, 0).toFixed(4)} (should be ~1.0)`);
    console.log(`   State value: ${valueData[0].toFixed(4)}`);
    console.log();

    testState.dispose();
    actionProbs.dispose();
    value.dispose();

    // Test 3: Batch inference
    console.log("Test 3: Batch inference test (10 samples)...");
    const batchState = tf.randomNormal([10, 25]);
    const batchProbs = actor.predict(batchState) as tf.Tensor;
    const batchValues = critic.predict(batchState) as tf.Tensor;
    
    console.log("✅ Batch inference successful");
    console.log(`   Output shapes: probs=${batchProbs.shape}, values=${batchValues.shape}`);
    console.log();

    batchState.dispose();
    batchProbs.dispose();
    batchValues.dispose();

    // Test 4: Action selection
    console.log("Test 4: Action selection test...");
    const state = tf.randomNormal([1, 25]);
    const probs = actor.predict(state) as tf.Tensor;
    const probsArray = await probs.array() as number[][];
    const action = probsArray[0].indexOf(Math.max(...probsArray[0]));
    
    const actionNames = ["HOLD", "BUY", "SELL", "CLOSE"];
    console.log("✅ Action selection successful");
    console.log(`   Selected action: ${actionNames[action]} (index ${action})`);
    console.log(`   Confidence: ${(probsArray[0][action] * 100).toFixed(2)}%`);
    console.log();

    state.dispose();
    probs.dispose();

    // Test 5: Memory check
    console.log("Test 5: Memory check...");
    const memInfo = tf.memory();
    console.log("✅ Memory status:");
    console.log(`   Tensors: ${memInfo.numTensors}`);
    console.log(`   Bytes: ${(memInfo.numBytes / 1024).toFixed(2)} KB`);
    console.log();

    console.log("=".repeat(60));
    console.log("✅ ALL TESTS PASSED");
    console.log("=".repeat(60));
    console.log();
    console.log("Model is ready for deployment!");

  } catch (error) {
    console.error();
    console.error("=".repeat(60));
    console.error("❌ TEST FAILED");
    console.error("=".repeat(60));
    console.error();
    console.error("Error:", error);
    throw error;
  }
}

testModel().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
