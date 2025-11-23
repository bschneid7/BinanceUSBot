# ML Model Batch Training Log

**Date:** November 23, 2025  
**Batch:** 3 models with varied hyperparameters

## Models Trained

### Model 1: High Learning Rate ⭐ DEPLOYED
- **Version:** ppo-3000ep-highLR-v1763902579577
- **Episodes:** 3,000
- **Learning Rate:** 0.0005 (vs 0.0003 standard)
- **Avg Reward:** 0.32
- **Status:** ✅ DEPLOYED

### Model 2: High Gamma
- **Version:** ppo-2500ep-highGamma-v1763902579588
- **Episodes:** 2,500
- **Gamma:** 0.995 (vs 0.99 standard)
- **Avg Reward:** 0.30
- **Status:** Not deployed (2nd best)

### Model 3: Low Epsilon
- **Version:** ppo-2500ep-lowEpsilon-v1763902579625
- **Episodes:** 2,500
- **Epsilon:** 0.1 (vs 0.2 standard)
- **Avg Reward:** 0.29
- **Status:** Not deployed (3rd best)

## Performance Ranking

1. High LR: 0.32 (+113% vs original) ✅ DEPLOYED
2. High Gamma: 0.30 (+100% vs original)
3. Low Epsilon: 0.29 (+93% vs original)
4. Previous: 0.28 (+87% vs original)
5. Original: 0.15 (baseline)

## Deployment Decision

**Selected:** High Learning Rate model (0.32 reward)  
**Improvement:** +14.3% vs previous, +113% vs original

## Key Findings

- Higher learning rate (0.0005) achieved best results
- More episodes (3000) improved performance
- High gamma and low epsilon also showed improvements but not as significant
