#!/usr/bin/env python3
import re

# Read the file
with open('server/services/exchangeFilters.ts', 'r') as f:
    content = f.read()

# The new fixed validateLotSize function
new_function = '''  validateLotSize(symbol: string, quantity: number): boolean {
    const filters = this.filters.get(symbol);
    if (!filters?.lotSizeFilter) {
      console.warn(`⚠️ [validateLotSize] No LOT_SIZE filter found for ${symbol}`);
      return false;
    }

    const { minQty, maxQty, stepSize } = filters.lotSizeFilter;
    const step = parseFloat(stepSize);
    const min = parseFloat(minQty);
    const max = parseFloat(maxQty);

    console.log(`[validateLotSize] Validating ${symbol}: qty=${quantity}, step=${stepSize}`);

    // Check min/max bounds
    if (quantity < min) {
      console.error(`❌ [validateLotSize] Quantity ${quantity} < minimum ${min} for ${symbol}`);
      return false;
    }
    
    if (quantity > max) {
      console.error(`❌ [validateLotSize] Quantity ${quantity} > maximum ${max} for ${symbol}`);
      return false;
    }

    // Calculate precision from stepSize
    const precision = this.getPrecision(stepSize);
    console.log(`[validateLotSize] Precision: ${precision}`);

    // Scale to integers to avoid floating-point errors
    const scaleFactor = Math.pow(10, precision);
    const quantityScaled = Math.round(quantity * scaleFactor);
    const stepScaled = Math.round(step * scaleFactor);

    console.log(`[validateLotSize] Scaled: ${quantityScaled} % ${stepScaled}`);

    // Integer modulo is exact (no floating-point errors)
    const remainder = quantityScaled % stepScaled;
    const isValid = remainder === 0;

    if (!isValid) {
      console.error(`❌ [validateLotSize] FAILED for ${symbol}`);
      console.error(`   Original: ${quantity} % ${step}`);
      console.error(`   Scaled: ${quantityScaled} % ${stepScaled} = ${remainder}`);
    } else {
      console.log(`✅ [validateLotSize] PASSED for ${symbol}`);
    }

    return isValid;
  }'''

# Find and replace the validateLotSize function
# Pattern: from "validateLotSize" to the closing brace of the function
pattern = r'  validateLotSize\(symbol: string, quantity: number\): boolean \{[^}]*(?:\{[^}]*\}[^}]*)*\}'

# Replace
content_new = re.sub(pattern, new_function, content, count=1)

# Write back
with open('server/services/exchangeFilters.ts', 'w') as f:
    f.write(content_new)

print("✅ validateLotSize function replaced successfully!")
