# PPO Agent (Shadow Mode)

The PPO (Proximal Policy Optimization) Agent is a reinforcement learning agent that learns optimal trading strategies through trial and error. It is currently running in **shadow mode**, which means it makes predictions but does not execute trades.

## How It Works

- **State Representation:** The PPO agent observes the market through a rich state representation that includes price action, technical indicators, volume, volatility, and portfolio status.
- **Action Space:** It can choose from a set of actions: BUY, SELL, HOLD, or CLOSE.
- **Reward Function:** It is rewarded for profitable trades and penalized for losses, with a strong penalty for large drawdowns.
- **Learning:** Through thousands of simulated trading episodes, it learns a policy that maps states to actions in a way that maximizes long-term reward.

## Shadow Mode

In shadow mode, the PPO agent runs in parallel with your live trading strategy:

1. **Prediction:** For every trading opportunity, the PPO agent makes its own decision.
2. **Comparison:** The system logs both the PPO's decision and the live strategy's decision.
3. **Performance Tracking:** When a trade is closed, the system calculates the P&L for both strategies.
4. **Validation:** Over time, we will build a statistically significant dataset to prove the PPO agent's effectiveness before deploying it live.

## Promotion to Live

Once the PPO agent consistently outperforms the live strategy by a significant margin (e.g., 10%+ higher Sharpe ratio), we will promote it to live trading using the A/B testing framework for a gradual and gradual rollout.
