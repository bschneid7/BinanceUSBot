# ML Orchestrator

The ML Orchestrator is the central nervous system of the bot's machine learning capabilities. It is responsible for coordinating all ML models and services to enhance trading decisions.

## Responsibilities

- **Signal Enhancement:** Receives raw trading signals and enhances them with ML-based insights.
- **Confidence Scoring:** Assigns a confidence score to each signal based on multiple ML models.
- **PPO Integration:** Gets trading recommendations from the PPO agent (in shadow mode) and compares them with the current strategy.
- **Model Management:** Manages different versions of ML models and routes signals to the appropriate models.
- **A/B Testing:** Facilitates A/B testing between different models and strategies.

## Workflow

1. **Receive Signal:** The Trading Engine sends a raw trading signal to the ML Orchestrator.
2. **Feature Enrichment:** The orchestrator enriches the signal with additional features, such as market regime, volatility, and correlation.
3. **Confidence Scoring:** It passes the enriched signal to the confidence scoring model to get a confidence score.
4. **PPO Shadow Mode:** It gets a recommendation from the PPO agent and logs the comparison for analysis.
5. **Signal Filtering:** Based on the confidence score and other criteria, it decides whether to approve, reject, or modify the signal.
6. **Return Enhanced Signal:** It returns the enhanced signal (with confidence score, PPO recommendation, etc.) to the Trading Engine for execution.
