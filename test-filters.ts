import exchangeFilters from './server/services/exchangeFilters';

(async () => {
  await exchangeFilters.loadFilters();
  const result = exchangeFilters.validateOrder('SOLUSD', 156, 5.14726454);
  console.log('Validation result:', JSON.stringify(result, null, 2));
  
  const rounded = exchangeFilters.roundQtyToStep('SOLUSD', 5.14726454);
  console.log('roundQtyToStep result:', rounded);
  
  const filters = exchangeFilters.getFilters('SOLUSD');
  console.log('SOLUSD LOT_SIZE filter:', JSON.stringify(filters?.lotSizeFilter, null, 2));
})();
