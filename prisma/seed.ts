/**
 * Prisma Seed Script — Extended
 * Seeds: admin user, focal agents, 25 members, savings accounts + 100+ txns, 10 loans
 */

import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randomDecimal(min: number, max: number) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(2));
}
function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

async function main() {
  console.info('🌱 Seeding database...');

  // Fetch roles from the database
  const roles = await prisma.role.findMany();
  const getRole = (slug: string) => {
    const role = roles.find(r => r.slug === slug);
    if (!role) throw new Error(`Role ${slug} not found in database! Ensure you run seed-roles.ts first.`);
    return role.id;
  };

  // ── 0. Super Admin user ────────────────────────────────────────────────────
  const superHash = await bcrypt.hash('Super@1234', 12);
  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@coop.local' },
    update: {},
    create: {
      email: 'superadmin@coop.local',
      passwordHash: superHash,
      roleId: getRole('super_admin'),
      isActive: true,
      mustChangePassword: false,
      menuPermissions: null,
    },
  });
  console.info(`✅ Super Admin user: ${superAdmin.email}`);

  // ── 1. Admin user ──────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('Admin@1234', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@coop.local' },
    update: {},
    create: {
      email: 'admin@coop.local',
      passwordHash,
      roleId: getRole('admin'),
      isActive: true,
      mustChangePassword: false,
      menuPermissions: null,
    },
  });
  console.info(`✅ Admin user: ${admin.email}`);

  // ── 2. Cashier user ────────────────────────────────────────────────────────
  const cashierHash = await bcrypt.hash('Cashier@1234', 12);
  const cashier = await prisma.user.upsert({
    where: { email: 'cashier@coop.local' },
    update: {},
    create: {
      email: 'cashier@coop.local',
      passwordHash: cashierHash,
      roleId: getRole('cashier'),
      isActive: true,
      mustChangePassword: false,
    },
  });

  // ── 3. Focal agent users & profiles ───────────────────────────────────────
  const agentData = [
    { email: 'agent1@coop.local', name: 'Abebe Girma', phone: '+251911000001', region: 'Addis Ababa' },
    { email: 'agent2@coop.local', name: 'Tigist Haile', phone: '+251911000002', region: 'Oromia' },
    { email: 'agent3@coop.local', name: 'Solomon Bekele', phone: '+251911000003', region: 'Amhara' },
  ];

  const focalAgents: any[] = [];
  for (const ag of agentData) {
    const hash = await bcrypt.hash('Agent@1234', 12);
    const user = await prisma.user.upsert({
      where: { email: ag.email },
      update: {},
      create: { email: ag.email, passwordHash: hash, roleId: getRole('focal_agent'), isActive: true, mustChangePassword: false },
    });
    const agent = await prisma.focalAgent.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, fullName: ag.name, phone: ag.phone, region: ag.region },
    });
    focalAgents.push(agent);
  }
  console.info(`✅ ${focalAgents.length} focal agents`);

  // ── 4. Savings products ────────────────────────────────────────────────────
  const spVoluntary = await prisma.savingsProduct.upsert({
    where: { id: 'sp-voluntary-001' },
    update: {},
    create: { id: 'sp-voluntary-001', name: 'Voluntary Savings', type: 'voluntary', interestRate: 5.0, minBalance: 0, noticePeriodDays: 0 },
  });
  const spRegular = await prisma.savingsProduct.upsert({
    where: { id: 'sp-regular-001' },
    update: {},
    create: { id: 'sp-regular-001', name: 'Regular Savings', type: 'regular', interestRate: 6.0, minBalance: 100, noticePeriodDays: 30 },
  });
  const spChildren = await prisma.savingsProduct.upsert({
    where: { id: 'sp-children-001' },
    update: {},
    create: { id: 'sp-children-001', name: "Children's Savings", type: 'children', interestRate: 7.0, minBalance: 0, noticePeriodDays: 0 },
  });
  console.info(`✅ 3 savings products`);

  // ── 5. Loan products ───────────────────────────────────────────────────────
  const lpShort = await prisma.loanProduct.upsert({
    where: { id: 'lp-short-001' },
    update: {},
    create: { id: 'lp-short-001', name: 'Short-Term Loan (6 months)', interestRate: 12.0, maxAmount: 50000, termMonths: 6 },
  });
  const lpMedium = await prisma.loanProduct.upsert({
    where: { id: 'lp-medium-001' },
    update: {},
    create: { id: 'lp-medium-001', name: 'Medium-Term Loan (12 months)', interestRate: 14.0, maxAmount: 150000, termMonths: 12 },
  });
  const lpLong = await prisma.loanProduct.upsert({
    where: { id: 'lp-long-001' },
    update: {},
    create: { id: 'lp-long-001', name: 'Long-Term Loan (24 months)', interestRate: 16.0, maxAmount: 500000, termMonths: 24 },
  });
  console.info(`✅ 3 loan products`);

  // ── 6. Members ────────────────────────────────────────────────────────────
  const memberSeed = [
    { name: 'Alemayehu Tadesse',    status: 'active',    daysJoined: 730 },
    { name: 'Birtukan Alemu',       status: 'active',    daysJoined: 680 },
    { name: 'Chernet Woldemariam', status: 'active',    daysJoined: 620 },
    { name: 'Dawit Assefa',         status: 'active',    daysJoined: 580 },
    { name: 'Eyerusalem Kebede',    status: 'active',    daysJoined: 540 },
    { name: 'Fikadu Haile',         status: 'active',    daysJoined: 500 },
    { name: 'Genet Mulugeta',       status: 'active',    daysJoined: 460 },
    { name: 'Henok Tesfaye',        status: 'active',    daysJoined: 420 },
    { name: 'Iyasu Bekele',         status: 'active',    daysJoined: 380 },
    { name: 'Jemila Hussain',       status: 'active',    daysJoined: 340 },
    { name: 'Kidist Tekle',         status: 'active',    daysJoined: 300 },
    { name: 'Liya Girma',           status: 'active',    daysJoined: 280 },
    { name: 'Mebratu Solomon',      status: 'active',    daysJoined: 260 },
    { name: 'Nigist Alemu',         status: 'active',    daysJoined: 240 },
    { name: 'Omer Sherif',          status: 'active',    daysJoined: 220 },
    { name: 'Petros Haile',         status: 'active',    daysJoined: 200 },
    { name: 'Rahel Tadesse',        status: 'active',    daysJoined: 180 },
    { name: 'Samuel Woldemariam',   status: 'active',    daysJoined: 160 },
    { name: 'Tigist Belay',         status: 'active',    daysJoined: 140 },
    { name: 'Wondwossen Negash',    status: 'active',    daysJoined: 120 },
    { name: 'Yonas Bekele',         status: 'active',    daysJoined: 100 },
    { name: 'Zewditu Girma',        status: 'active',    daysJoined: 80  },
    { name: 'Abdu Shemsu',          status: 'suspended', daysJoined: 400 },
    { name: 'Bekelech Negash',      status: 'suspended', daysJoined: 350 },
    { name: 'Dawit Mekonnen',       status: 'exited',    daysJoined: 600 },
  ];

  const members: any[] = [];
  for (let i = 0; i < memberSeed.length; i++) {
    const seed = memberSeed[i];
    const code = `MEM-${String(i + 1).padStart(4, '0')}`;
    const existing = await prisma.member.findUnique({ where: { memberCode: code } });
    if (existing) { members.push(existing); continue; }

    const m = await prisma.member.create({
      data: {
        memberCode: code,
        fullName: seed.name,
        phone: `+25191100${String(i + 10).padStart(4, '0')}`,
        email: `${seed.name.split(' ')[0].toLowerCase()}${i + 1}@example.com`,
        nationalId: `ETH-${String(100000 + i)}`,
        address: `Kebele ${randomBetween(1, 20)}, ${agentData[i % 3].region}`,
        focalAgentId: focalAgents[i % 3].id,
        registrationFee: 100,
        joinDate: daysAgo(seed.daysJoined),
        status: seed.status as any,
        createdBy: admin.id,
      },
    });
    members.push(m);
  }
  console.info(`✅ ${members.length} members`);

  // ── 7. Savings accounts + transactions ─────────────────────────────────────
  const activeMembers = members.filter((m) => m.status === 'active');
  let txnCount = 0;

  // Find the highest existing account number so we never collide
  const lastAcct = await prisma.savingsAccount.findFirst({ orderBy: { accountNumber: 'desc' } });
  let acctCounter = lastAcct ? (parseInt(lastAcct.accountNumber) + 1 || 100000) : 100000;

  for (const member of activeMembers) {
    // Voluntary account for everyone
    let volAcct = await prisma.savingsAccount.findFirst({ where: { memberId: member.id, productId: spVoluntary.id } });
    if (!volAcct) {
      volAcct = await prisma.savingsAccount.create({ data: { memberId: member.id, productId: spVoluntary.id, accountNumber: (acctCounter++).toString() } });
    }

    // 5–10 deposits
    for (let d = 0; d < randomBetween(5, 10); d++) {
      await prisma.savingsTxn.create({
        data: {
          accountId: volAcct.id,
          type: 'deposit',
          amount: randomDecimal(500, 5000),
          paymentMethod: (['cash', 'bank', 'mobile_money'] as const)[randomBetween(0, 2)],
          txnDate: daysAgo(randomBetween(1, 365)),
          receiptNo: `RCP-V-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          focalAgentId: member.focalAgentId,
          recordedBy: cashier.id,
        },
      });
      txnCount++;
    }

    // 1–2 withdrawals
    if (randomBetween(0, 1)) {
      for (let w = 0; w < randomBetween(1, 2); w++) {
        await prisma.savingsTxn.create({
          data: {
            accountId: volAcct.id,
            type: 'withdrawal',
            amount: randomDecimal(200, 800),
            paymentMethod: 'cash',
            txnDate: daysAgo(randomBetween(1, 180)),
            receiptNo: `RCP-W-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            recordedBy: cashier.id,
          },
        });
        txnCount++;
      }
    }

    // Half also have a regular account
    if (activeMembers.indexOf(member) % 2 === 0) {
      let regAcct = await prisma.savingsAccount.findFirst({ where: { memberId: member.id, productId: spRegular.id } });
      if (!regAcct) {
        regAcct = await prisma.savingsAccount.create({ data: { memberId: member.id, productId: spRegular.id, accountNumber: (acctCounter++).toString() } });
      }
      for (let d = 0; d < randomBetween(3, 6); d++) {
        await prisma.savingsTxn.create({
          data: {
            accountId: regAcct.id,
            type: 'deposit',
            amount: randomDecimal(1000, 10000),
            paymentMethod: 'bank',
            txnDate: daysAgo(randomBetween(1, 300)),
            receiptNo: `RCP-R-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            recordedBy: cashier.id,
          },
        });
        txnCount++;
      }
    }
  }
  console.info(`✅ ${txnCount} savings transactions`);

  // ── 8. Loans ──────────────────────────────────────────────────────────────
  const loanScenarios = [
    { memberIdx: 0, product: lpShort,  principal: 20000,  status: 'active',   disbDays: 60  },
    { memberIdx: 1, product: lpMedium, principal: 80000,  status: 'active',   disbDays: 120 },
    { memberIdx: 2, product: lpLong,   principal: 200000, status: 'active',   disbDays: 200 },
    { memberIdx: 3, product: lpShort,  principal: 15000,  status: 'closed',   disbDays: 300 },
    { memberIdx: 4, product: lpMedium, principal: 50000,  status: 'pending',  disbDays: 0   },
    { memberIdx: 5, product: lpShort,  principal: 30000,  status: 'pending',  disbDays: 0   },
    { memberIdx: 6, product: lpLong,   principal: 350000, status: 'active',   disbDays: 400 },
    { memberIdx: 7, product: lpMedium, principal: 60000,  status: 'defaulted',disbDays: 500 },
    { memberIdx: 8, product: lpShort,  principal: 25000,  status: 'active',   disbDays: 30  },
    { memberIdx: 9, product: lpMedium, principal: 90000,  status: 'closed',   disbDays: 380 },
  ];

  let loanCount = 0;
  let repayCount = 0;

  for (const sc of loanScenarios) {
    const member = members[sc.memberIdx];
    const disbDate = sc.disbDays > 0 ? daysAgo(sc.disbDays) : undefined;
    const dueDate = disbDate ? new Date(disbDate.getTime()) : undefined;
    if (dueDate) dueDate.setMonth(dueDate.getMonth() + sc.product.termMonths);

    const repaidFraction = sc.status === 'closed' ? 1.0 : sc.status === 'active' ? randomDecimal(0.15, 0.6) : 0;
    const outstanding = sc.status === 'pending' ? sc.principal : parseFloat((sc.principal * (1 - repaidFraction)).toFixed(2));

    const existing = await prisma.loan.findFirst({ where: { memberId: member.id, status: sc.status as any } });
    if (existing) { loanCount++; continue; }

    const loan = await prisma.loan.create({
      data: {
        memberId: member.id,
        loanProductId: sc.product.id,
        principal: sc.principal,
        interestRate: sc.product.interestRate,
        termMonths: sc.product.termMonths,
        disbursedDate: disbDate,
        dueDate,
        status: sc.status as any,
        outstanding: Math.max(0, outstanding),
        approvedBy: sc.status !== 'pending' ? admin.id : undefined,
        approvedAt: sc.status !== 'pending' ? daysAgo(sc.disbDays + 2) : undefined,
      },
    });
    loanCount++;

    // Create repayments for disbursed loans
    if (disbDate && sc.status !== 'pending') {
      const paidMonths = sc.status === 'closed'
        ? sc.product.termMonths
        : Math.floor(sc.disbDays / 30);

      for (let r = 0; r < Math.min(paidMonths, sc.product.termMonths); r++) {
        const paidDate = new Date(disbDate);
        paidDate.setMonth(paidDate.getMonth() + r + 1);
        if (paidDate > new Date()) break;

        const monthlyPrincipal = parseFloat((sc.principal / sc.product.termMonths).toFixed(2));
        const monthlyInterest = parseFloat((sc.principal * Number(sc.product.interestRate) / 100 / 12).toFixed(2));

        await prisma.repayment.create({
          data: {
            loanId: loan.id,
            amount: monthlyPrincipal + monthlyInterest,
            principalPortion: monthlyPrincipal,
            interestPortion: monthlyInterest,
            receiptNo: `LRP-${loan.id.slice(0, 6)}-${r + 1}`,
            paidDate,
            recordedBy: cashier.id,
          },
        });
        repayCount++;
      }
    }
  }
  console.info(`✅ ${loanCount} loans + ${repayCount} repayments`);

  // ── 9. Daily Collection Sessions + Entries ────────────────────────────────
  let collectionCount = 0;
  const collectionDays = [1, 3, 7, 14, 21]; // seed entries for last few days

  for (const daysBack of collectionDays) {
    const collDate = daysAgo(daysBack);

    // Find or create a focal agent
    const agent = focalAgents[0];

    let session = await prisma.dailyCollection.findFirst({
      where: { focalAgentId: agent.id, collectionDate: collDate },
    });

    if (!session) {
      session = await prisma.dailyCollection.create({
        data: {
          focalAgentId: agent.id,
          collectionDate: collDate,
          totalCollected: 0,
          membersServed: 0,
        },
      });
    }

    // Seed 5–8 collection entries for this session
    const sessionMembers = activeMembers.slice(0, randomBetween(5, 8));
    let sessionTotal = 0;

    for (const member of sessionMembers) {
      const existing = await prisma.dailyCollectionEntry.findFirst({
        where: { sessionId: session.id, memberId: member.id },
      });
      if (existing) continue;

      const voluntary     = randomDecimal(100, 500);
      const regular       = randomDecimal(50, 300);
      const children      = randomDecimal(0, 150);
      const loanSaving    = randomDecimal(0, 200);
      const loanRepay     = randomDecimal(200, 800);
      const loanInterest  = randomDecimal(10, 100);
      const share         = randomDecimal(0, 100);
      const bookFee       = [0, 10, 20][randomBetween(0, 2)];
      const regFee        = [0, 100][randomBetween(0, 1)];
      const total = voluntary + regular + children + loanSaving + loanRepay + loanInterest + share + bookFee + regFee;

      await prisma.dailyCollectionEntry.create({
        data: {
          sessionId:            session.id,
          memberId:             member.id,
          voluntarySaving:      voluntary,
          interestFromVoluntary: 0,
          loanSaving:           loanSaving,
          regularSaving:        regular,
          interestFromRegular:  0,
          childrensSaving:      children,
          loanAmount:           0,
          dailyLoanRepayment:   loanRepay,
          loanInterestAmount:   loanInterest,
          dailyCollectedShare:  share,
          bookFee:              bookFee,
          registrationFee:      regFee,
          totalAmount:          parseFloat(total.toFixed(2)),
          recordedBy:           cashier.id,
        },
      });

      sessionTotal += total;
      collectionCount++;
    }

    // Update session totals
    await prisma.dailyCollection.update({
      where: { id: session.id },
      data: {
        totalCollected: parseFloat(sessionTotal.toFixed(2)),
        membersServed: sessionMembers.length,
      },
    });
  }
  console.info(`✅ ${collectionCount} daily collection entries`);

  console.info('\n🎉 Seeding complete!');
  console.info('\nCredentials:');
  console.info('  Super:   superadmin@coop.local / Super@1234');
  console.info('  Admin:   admin@coop.local   / Admin@1234');
  console.info('  Cashier: cashier@coop.local / Cashier@1234');
  console.info('  Agent:   agent1@coop.local  / Agent@1234');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
