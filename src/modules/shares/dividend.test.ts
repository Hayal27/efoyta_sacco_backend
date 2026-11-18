import * as dividendService from './dividend.service';

describe('Dividend Engine Service', () => {
  it('should have dividend calculation methods defined', () => {
    expect(dividendService.calculateDividends).toBeDefined();
    expect(dividendService.approveDividendRun).toBeDefined();
    expect(dividendService.postDividendsToSavings).toBeDefined();
    expect(dividendService.listDividendRuns).toBeDefined();
  });
});
