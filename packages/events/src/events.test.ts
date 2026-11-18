import {
  createEventEnvelope,
  COOP_EVENT_TYPES,
  SavingsDepositedPayloadSchema,
  LoanRepaidPayloadSchema,
} from './index';

function runTests() {
  console.log('Testing @coop/events...');

  // Test 1: Savings Deposited Envelope
  const depositPayload = {
    accountId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    memberId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    amount: 5000.0,
    paymentMethod: 'cash',
    reference: 'DEP-2026-001',
    depositedAt: new Date().toISOString(),
  };

  const parsedDeposit = SavingsDepositedPayloadSchema.safeParse(depositPayload);
  if (!parsedDeposit.success) {
    throw new Error('Deposit schema parse failed: ' + JSON.stringify(parsedDeposit.error));
  }

  const envelope = createEventEnvelope(
    COOP_EVENT_TYPES.SAVINGS_DEPOSITED,
    'urn:coop:service:savings',
    depositPayload.accountId,
    parsedDeposit.data,
    { traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' }
  );

  if (envelope.specversion !== '1.0' || envelope.type !== 'financial.savings.deposited') {
    throw new Error('Envelope construction error');
  }

  // Test 2: Loan Repaid Envelope
  const loanPayload = {
    loanId: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
    memberId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    amount: 1250.5,
    principalPaid: 1000.0,
    interestPaid: 250.5,
    penaltyPaid: 0,
    receiptNo: 'RCP-998822',
    newOutstanding: 8750.0,
  };

  const parsedLoan = LoanRepaidPayloadSchema.safeParse(loanPayload);
  if (!parsedLoan.success) {
    throw new Error('Loan schema parse failed: ' + JSON.stringify(parsedLoan.error));
  }

  console.log('✅ All @coop/events contract tests passed successfully!');
}

runTests();
