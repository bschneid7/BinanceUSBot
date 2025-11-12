# System Architecture Overview

This document provides a high-level overview of the BinanceUSBot system architecture, including all major components and their interactions.

## Core Components

- **Trading Engine:** The core of the bot, responsible for executing trades, managing positions, and implementing trading strategies.
- **ML Orchestrator:** Manages all machine learning models, including signal filtering, confidence scoring, and PPO agent.
- **PPO Agent:** A reinforcement learning agent that learns optimal trading decisions in shadow mode.
- **Risk Management:** A suite of services for managing risk, including portfolio VaR, correlation analysis, and circuit breakers.
- **Data Pipeline:** Collects and preprocesses market data for ML model training and backtesting.
- **Web Dashboard:** A React-based web interface for monitoring the bot, viewing performance, and manual trading.
- **API Server:** An Express.js backend that provides a REST API for the web dashboard and external integrations.
- **Database:** MongoDB for storing all trading data, configurations, and logs.
- **Monitoring & Alerting:** Prometheus for metrics, Grafana for dashboards, and Slack for real-time alerts.

## High-Level Architecture Diagram

```mermaid
graph TD
    subgraph User Interface
        A[Web Dashboard] --> B{API Server}
    end

    subgraph Core Trading Logic
        B --> C[Trading Engine]
        C --> D[ML Orchestrator]
        D --> E[PPO Agent (Shadow Mode)]
        C --> F[Risk Management]
        C --> G[Binance API]
    end

    subgraph Data & ML
        H[Data Pipeline] --> I[ML Model Training]
        I --> D
    end

    subgraph Monitoring
        C --> J[Prometheus]
        J --> K[Grafana]
        C --> L[Slack Alerts]
    end

    subgraph Database
        C --> M[MongoDB]
        B --> M
    end
```
