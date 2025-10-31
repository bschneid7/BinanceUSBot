"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var tf = require("@tensorflow/tfjs-node");
var axios_1 = require("axios");
console.log('[CPU] TensorFlow backend:', tf.getBackend());
console.log('[CPU] Starting 1000-episode PPO training...\n');
var PPO = /** @class */ (function () {
    function PPO(stateDim, actionDim) {
        this.actor = tf.sequential({
            layers: [
                tf.layers.dense({ inputShape: [stateDim], units: 128, activation: 'relu', kernelInitializer: 'heNormal' }),
                tf.layers.dropout({ rate: 0.2 }),
                tf.layers.dense({ units: 64, activation: 'relu', kernelInitializer: 'heNormal' }),
                tf.layers.dense({ units: actionDim, activation: 'softmax' })
            ]
        });
        this.critic = tf.sequential({
            layers: [
                tf.layers.dense({ inputShape: [stateDim], units: 128, activation: 'relu', kernelInitializer: 'heNormal' }),
                tf.layers.dropout({ rate: 0.2 }),
                tf.layers.dense({ units: 64, activation: 'relu', kernelInitializer: 'heNormal' }),
                tf.layers.dense({ units: 1 })
            ]
        });
        this.actor.compile({ optimizer: tf.train.adam(0.0003), loss: 'categoricalCrossentropy' });
        this.critic.compile({ optimizer: tf.train.adam(0.001), loss: 'meanSquaredError' });
    }
    PPO.prototype.getAction = function (state_1) {
        return __awaiter(this, arguments, void 0, function (state, epsilon) {
            var _this = this;
            if (epsilon === void 0) { epsilon = 0.1; }
            return __generator(this, function (_a) {
                // Epsilon-greedy exploration
                if (Math.random() < epsilon) {
                    return [2 /*return*/, Math.floor(Math.random() * 4)];
                }
                return [2 /*return*/, tf.tidy(function () {
                        var probs = _this.actor.predict(tf.tensor2d([state]));
                        var probsArray = Array.from(probs.dataSync());
                        // Sample from distribution
                        var rand = Math.random();
                        var cumsum = 0;
                        for (var i = 0; i < probsArray.length; i++) {
                            cumsum += probsArray[i];
                            if (rand < cumsum)
                                return i;
                        }
                        return probsArray.length - 1;
                    })];
            });
        });
    };
    PPO.prototype.train = function (states, actions, rewards, returns) {
        return __awaiter(this, void 0, void 0, function () {
            var statesTensor, returnsTensor, values, valuesArray, advantages, mean, std, normalizedAdvantages, actionOneHot, weightedTargets;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (states.length === 0)
                            return [2 /*return*/];
                        statesTensor = tf.tensor2d(states);
                        returnsTensor = tf.tensor1d(returns);
                        // Train critic
                        return [4 /*yield*/, this.critic.fit(statesTensor, returnsTensor, {
                                epochs: 1,
                                verbose: 0,
                                batchSize: Math.min(32, states.length)
                            })];
                    case 1:
                        // Train critic
                        _a.sent();
                        values = this.critic.predict(statesTensor);
                        valuesArray = Array.from(values.dataSync());
                        advantages = returns.map(function (r, i) { return r - valuesArray[i]; });
                        mean = advantages.reduce(function (a, b) { return a + b; }, 0) / advantages.length;
                        std = Math.sqrt(advantages.reduce(function (sum, a) { return sum + Math.pow(a - mean, 2); }, 0) / advantages.length);
                        normalizedAdvantages = advantages.map(function (a) { return (a - mean) / (std + 1e-8); });
                        actionOneHot = tf.tidy(function () {
                            var actionsTensor = tf.tensor1d(actions, 'int32');
                            return tf.oneHot(actionsTensor, 4);
                        });
                        weightedTargets = tf.tidy(function () {
                            var advTensor = tf.tensor2d(normalizedAdvantages.map(function (a) { return [a, a, a, a]; }));
                            return tf.mul(actionOneHot, advTensor);
                        });
                        return [4 /*yield*/, this.actor.fit(statesTensor, actionOneHot, {
                                epochs: 1,
                                verbose: 0,
                                batchSize: Math.min(32, states.length)
                            })];
                    case 2:
                        _a.sent();
                        // Cleanup
                        statesTensor.dispose();
                        returnsTensor.dispose();
                        values.dispose();
                        actionOneHot.dispose();
                        weightedTargets.dispose();
                        return [2 /*return*/];
                }
            });
        });
    };
    PPO.prototype.save = function (path) {
        return __awaiter(this, void 0, void 0, function () {
            var fs;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        fs = require('fs');
                        fs.mkdirSync(path, { recursive: true });
                        return [4 /*yield*/, this.actor.save("file://".concat(path, "/actor"))];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.critic.save("file://".concat(path, "/critic"))];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    return PPO;
}());
(function (symbol, days) {
    var url = "https://api.binance.us/api/v3/klines?symbol=".concat(symbol, "&interval=1h&limit=").concat(days * 24);
    var res = yield axios_1.default.get(url);
    return res.data.map(function (k) { return ({
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3])
    }); });
});
function buildState(candles, idx) {
    var state = [];
    // Normalize prices relative to current price
    var currentPrice = candles[idx].close;
    for (var i = 19; i >= 0; i--) {
        state.push((candles[idx - i].close - currentPrice) / currentPrice);
    }
    // Returns
    for (var i = 20; i >= 1; i--) {
        var ret = (candles[idx - i + 1].close - candles[idx - i].close) / candles[idx - i].close;
        state.push(ret);
    }
    // Volume
    var avgVol = candles.slice(idx - 20, idx).reduce(function (s, c) { return s + c.volume; }, 0) / 20;
    for (var i = 19; i >= 0; i--) {
        state.push((candles[idx - i].volume - avgVol) / (avgVol + 1));
    }
    // Simple indicators
    state.push(0.5, 0.01, 0.001);
    for (var i = 0; i < 20; i++)
        state.push(0);
    return state;
}
function calculateReturns(rewards, gamma) {
    if (gamma === void 0) { gamma = 0.99; }
    var returns = [];
    var runningReturn = 0;
    for (var i = rewards.length - 1; i >= 0; i--) {
        runningReturn = rewards[i] + gamma * runningReturn;
        returns[i] = runningReturn;
    }
    return returns;
}
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var candles, trainSize, valSize, agent, bestValReward, patience, startTime, ep, epsilon, states, actions, rewards, cash, pos, buyPrice, episodeReward, i, state, action, price, stepReward, pnl, returns, valReward, valCash, valPos, valBuyPrice, valTrades, i, state, action, price, pnl, elapsed, pctComplete, path, path, totalHours;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('[CPU] Fetching BTC data...');
                    return [4 /*yield*/, fetchData('BTCUSDT', 90)];
                case 1:
                    candles = _a.sent();
                    console.log("[CPU] Loaded ".concat(candles.length, " candles"));
                    console.log("[CPU] Price range: $".concat(Math.min.apply(Math, candles.map(function (c) { return c.close; })).toFixed(0), " - $").concat(Math.max.apply(Math, candles.map(function (c) { return c.close; })).toFixed(0), "\n"));
                    trainSize = Math.floor(candles.length * 0.7);
                    valSize = Math.floor(candles.length * 0.15);
                    agent = new PPO(83, 4);
                    console.log('[CPU] Training 1000 episodes (est. 6-8 hours)...\n');
                    bestValReward = -Infinity;
                    patience = 0;
                    startTime = Date.now();
                    ep = 1;
                    _a.label = 2;
                case 2:
                    if (!(ep <= 1000)) return [3 /*break*/, 17];
                    epsilon = Math.max(0.01, 0.5 * Math.pow(0.995, ep));
                    states = [];
                    actions = [];
                    rewards = [];
                    cash = 10000;
                    pos = 0;
                    buyPrice = 0;
                    episodeReward = 0;
                    i = 30;
                    _a.label = 3;
                case 3:
                    if (!(i < trainSize - 1)) return [3 /*break*/, 6];
                    state = buildState(candles, i);
                    return [4 /*yield*/, agent.getAction(state, epsilon)];
                case 4:
                    action = _a.sent();
                    price = candles[i].close;
                    stepReward = 0;
                    if (action === 1 && pos === 0) {
                        // Buy
                        pos = 1;
                        buyPrice = price;
                        stepReward = 0; // Neutral for buying
                    }
                    else if (action === 2 && pos > 0) {
                        pnl = (price - buyPrice) / buyPrice;
                        stepReward = pnl * 10; // Scale up reward
                        episodeReward += pnl;
                        pos = 0;
                    }
                    else if ((action === 1 && pos > 0) || (action === 2 && pos === 0)) {
                        // Invalid action
                        stepReward = -0.1;
                    }
                    else {
                        // Hold or wait
                        stepReward = 0;
                    }
                    states.push(state);
                    actions.push(action);
                    rewards.push(stepReward);
                    _a.label = 5;
                case 5:
                    i++;
                    return [3 /*break*/, 3];
                case 6:
                    returns = calculateReturns(rewards);
                    // Train model
                    return [4 /*yield*/, agent.train(states, actions, rewards, returns)];
                case 7:
                    // Train model
                    _a.sent();
                    if (!(ep % 10 === 0)) return [3 /*break*/, 14];
                    valReward = 0;
                    valCash = 10000;
                    valPos = 0;
                    valBuyPrice = 0;
                    valTrades = 0;
                    i = trainSize + 30;
                    _a.label = 8;
                case 8:
                    if (!(i < trainSize + valSize - 1)) return [3 /*break*/, 11];
                    state = buildState(candles, i);
                    return [4 /*yield*/, agent.getAction(state, 0)];
                case 9:
                    action = _a.sent();
                    price = candles[i].close;
                    if (action === 1 && valPos === 0) {
                        valPos = 1;
                        valBuyPrice = price;
                        valTrades++;
                    }
                    else if (action === 2 && valPos > 0) {
                        pnl = (price - valBuyPrice) / valBuyPrice;
                        valReward += pnl;
                        valPos = 0;
                        valTrades++;
                    }
                    _a.label = 10;
                case 10:
                    i++;
                    return [3 /*break*/, 8];
                case 11:
                    elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
                    pctComplete = (ep / 1000 * 100).toFixed(1);
                    console.log("[CPU] Ep ".concat(ep, "/1000 (").concat(pctComplete, "%, ").concat(elapsed, "min): Train=").concat(episodeReward.toFixed(4), ", Val=").concat(valReward.toFixed(4), ", \u03B5=").concat(epsilon.toFixed(3)));
                    if (!(valReward > bestValReward)) return [3 /*break*/, 13];
                    bestValReward = valReward;
                    patience = 0;
                    path = "/opt/binance-bot/ml_models_cpu_1000/best_".concat(Date.now());
                    return [4 /*yield*/, agent.save(path)];
                case 12:
                    _a.sent();
                    console.log("  \u2705 Best model saved (".concat(valTrades, " val trades)"));
                    return [3 /*break*/, 14];
                case 13:
                    patience++;
                    if (patience >= 8) {
                        console.log("  \u26A0\uFE0F  Early stop at episode ".concat(ep));
                        return [3 /*break*/, 17];
                    }
                    _a.label = 14;
                case 14:
                    if (!(ep % 100 === 0)) return [3 /*break*/, 16];
                    path = "/opt/binance-bot/ml_models_cpu_1000/checkpoint_ep".concat(ep, "_").concat(Date.now());
                    return [4 /*yield*/, agent.save(path)];
                case 15:
                    _a.sent();
                    console.log('  💾 Checkpoint');
                    _a.label = 16;
                case 16:
                    ep++;
                    return [3 /*break*/, 2];
                case 17:
                    totalHours = ((Date.now() - startTime) / 1000 / 3600).toFixed(2);
                    console.log("\n\u2705 Training complete in ".concat(totalHours, " hours!"));
                    console.log("Best validation reward: ".concat(bestValReward.toFixed(4)));
                    console.log('\nModels saved to: /opt/binance-bot/ml_models_cpu_1000/');
                    return [2 /*return*/];
            }
        });
    });
}
main().catch(console.error);
