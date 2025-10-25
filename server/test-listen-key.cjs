
const binanceService = require('./services/binanceService').default;

async function test() {
  try {
    console.log("Testing listen key creation...");
    const listenKey = await binanceService.createListenKey();
    console.log("✅ Listen key created:", listenKey);
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error);
  }
  process.exit(0);
}

test();

