import * as tf from "@tensorflow/tfjs-node";
import * as fs from "fs";
import * as path from "path";

interface ModelConfig {
  stateDim: number;
  actionDim: number;
}

function buildActor(config: ModelConfig): tf.LayersModel {
  const input = tf.input({ shape: [config.stateDim] });
  
  let x = tf.layers.dense({ units: 128, activation: "relu", name: "actor_dense1" }).apply(input) as tf.SymbolicTensor;
  x = tf.layers.dropout({ rate: 0.2, name: "actor_dropout1" }).apply(x) as tf.SymbolicTensor;
  x = tf.layers.dense({ units: 64, activation: "relu", name: "actor_dense2" }).apply(x) as tf.SymbolicTensor;
  x = tf.layers.dropout({ rate: 0.2, name: "actor_dropout2" }).apply(x) as tf.SymbolicTensor;
  x = tf.layers.dense({ units: 32, activation: "relu", name: "actor_dense3" }).apply(x) as tf.SymbolicTensor;
  const output = tf.layers.dense({ units: config.actionDim, activation: "softmax", name: "actor_output" }).apply(x) as tf.SymbolicTensor;
  
  return tf.model({ inputs: input, outputs: output, name: "actor" });
}

function buildCritic(config: ModelConfig): tf.LayersModel {
  const input = tf.input({ shape: [config.stateDim] });
  
  let x = tf.layers.dense({ units: 128, activation: "relu", name: "critic_dense1" }).apply(input) as tf.SymbolicTensor;
  x = tf.layers.dropout({ rate: 0.2, name: "critic_dropout1" }).apply(x) as tf.SymbolicTensor;
  x = tf.layers.dense({ units: 64, activation: "relu", name: "critic_dense2" }).apply(x) as tf.SymbolicTensor;
  x = tf.layers.dropout({ rate: 0.2, name: "critic_dropout2" }).apply(x) as tf.SymbolicTensor;
  x = tf.layers.dense({ units: 32, activation: "relu", name: "critic_dense3" }).apply(x) as tf.SymbolicTensor;
  const output = tf.layers.dense({ units: 1, activation: "linear", name: "critic_output" }).apply(x) as tf.SymbolicTensor;
  
  return tf.model({ inputs: input, outputs: output, name: "critic" });
}

async function convertModel() {
  console.log("=".repeat(60));
  console.log("ML Model Conversion - HDF5 to TensorFlow.js");
  console.log("=".repeat(60));
  console.log();

  const config: ModelConfig = {
    stateDim: 25,
    actionDim: 4
  };

  const weightsDir = "/opt/binance-bot/ml_models/checkpoints_20251029_035628/checkpoint_ep150";
  const outputDir = "/opt/binance-bot/ml_models/production_230ep_converted";

  try {
    // Step 1: Build model architecture
    console.log("Step 1: Building model architecture...");
    const actor = buildActor(config);
    const critic = buildCritic(config);
    console.log("✅ Models built successfully");
    console.log(`   Actor: ${config.stateDim} inputs -> ${config.actionDim} outputs`);
    console.log(`   Critic: ${config.stateDim} inputs -> 1 output`);
    console.log();

    // Step 2: Load weights from .h5 files
    console.log("Step 2: Loading weights from HDF5 files...");
    console.log(`   Source: ${weightsDir}`);
    
    await actor.loadWeights(`${weightsDir}/actor.weights.h5`);
    console.log("   ✅ Actor weights loaded");
    
    await critic.loadWeights(`${weightsDir}/critic.weights.h5`);
    console.log("   ✅ Critic weights loaded");
    console.log();

    // Step 3: Create output directory
    console.log("Step 3: Creating output directory...");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    console.log(`   ✅ Directory ready: ${outputDir}`);
    console.log();

    // Step 4: Save in TensorFlow.js format
    console.log("Step 4: Saving models in TensorFlow.js format...");
    
    await actor.save(`file://${outputDir}/actor`);
    console.log("   ✅ Actor saved");
    
    await critic.save(`file://${outputDir}/critic`);
    console.log("   ✅ Critic saved");
    console.log();

    // Step 5: Verify the conversion
    console.log("Step 5: Verifying conversion...");
    const loadedActor = await tf.loadLayersModel(`file://${outputDir}/actor/model.json`);
    const loadedCritic = await tf.loadLayersModel(`file://${outputDir}/critic/model.json`);
    
    console.log("   ✅ Actor loaded successfully");
    console.log(`      Input shape: ${loadedActor.inputs[0].shape}`);
    console.log(`      Output shape: ${loadedActor.outputs[0].shape}`);
    
    console.log("   ✅ Critic loaded successfully");
    console.log(`      Input shape: ${loadedCritic.inputs[0].shape}`);
    console.log(`      Output shape: ${loadedCritic.outputs[0].shape}`);
    console.log();

    // Step 6: Test inference
    console.log("Step 6: Testing inference...");
    const testState = tf.randomNormal([1, config.stateDim]);
    
    const actionProbs = loadedActor.predict(testState) as tf.Tensor;
    const value = loadedCritic.predict(testState) as tf.Tensor;
    
    const probsData = await actionProbs.data();
    const valueData = await value.data();
    
    console.log("   ✅ Inference test passed");
    console.log(`      Action probabilities: [${Array.from(probsData).map(p => p.toFixed(4)).join(", ")}]`);
    console.log(`      State value: ${valueData[0].toFixed(4)}`);
    console.log();

    // Cleanup
    testState.dispose();
    actionProbs.dispose();
    value.dispose();

    // Step 7: List output files
    console.log("Step 7: Output files created:");
    const actorFiles = fs.readdirSync(`${outputDir}/actor`);
    const criticFiles = fs.readdirSync(`${outputDir}/critic`);
    
    console.log("   Actor:");
    actorFiles.forEach(file => {
      const stats = fs.statSync(`${outputDir}/actor/${file}`);
      console.log(`      - ${file} (${(stats.size / 1024).toFixed(2)} KB)`);
    });
    
    console.log("   Critic:");
    criticFiles.forEach(file => {
      const stats = fs.statSync(`${outputDir}/critic/${file}`);
      console.log(`      - ${file} (${(stats.size / 1024).toFixed(2)} KB)`);
    });
    console.log();

    console.log("=".repeat(60));
    console.log("✅ CONVERSION COMPLETE!");
    console.log("=".repeat(60));
    console.log();
    console.log("Next steps:");
    console.log("1. Update bot configuration to use new model path");
    console.log("2. Restart bot to load new model");
    console.log("3. Monitor performance for win rate improvement");
    console.log();
    console.log(`Model location: ${outputDir}`);

  } catch (error) {
    console.error();
    console.error("=".repeat(60));
    console.error("❌ CONVERSION FAILED");
    console.error("=".repeat(60));
    console.error();
    console.error("Error:", error);
    throw error;
  }
}

convertModel().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
