import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedHrComplete() {
  console.log('🌱 Starting comprehensive HR data seeding...');

  // Reset existing HR records to ensure clean foreign keys and reporting hierarchy
  console.log('🧹 Cleaning previous test HR records...');
  await prisma.hrOffboardingClearance.deleteMany();
  await prisma.hrTrainingParticipant.deleteMany();
  await prisma.hrEmployeeMovement.deleteMany();
  await prisma.hrPerformanceAppraisal.deleteMany();
  await prisma.hrAttendanceRecord.deleteMany();
  await prisma.hrLeaveApplication.deleteMany();
  await prisma.hrWorkforcePlan.deleteMany();
  // Clear self-referencing supervisorId first
  await prisma.hrEmployee.updateMany({ data: { supervisorId: null } });
  await prisma.hrEmployee.deleteMany();
  await prisma.hrPosition.deleteMany();
  await prisma.hrOrganizationUnit.updateMany({ data: { parentId: null, managerId: null } });
  await prisma.hrOrganizationUnit.deleteMany();
  await prisma.hrJobGrade.deleteMany();
  await prisma.hrLeaveType.deleteMany();
  await prisma.hrTrainingProgram.deleteMany();
  await prisma.hrPerformanceCycle.deleteMany();
  console.log('🧹 Cleaned!');

  // ── 0. Query Existing System Branches, Roles, and Users ──────────────────────
  console.log('🔗 Fetching Existing System Branches, Roles, and Users for HR Integration...');
  const branches = await prisma.branch.findMany();
  const mainBranch = branches.find(b => b.code === 'GQ 1' || b.name.toLowerCase().includes('main')) || branches[0];
  const atoteBranch = branches.find(b => b.code === 'BRANCH' || b.name.toLowerCase().includes('atote')) || branches[1] || mainBranch;

  const roles = await prisma.role.findMany();
  const superAdminRole = roles.find(r => r.name === 'Super Admin') || roles[0];
  const adminRole = roles.find(r => r.name === 'Admin') || roles[0];
  const hrRole = roles.find(r => r.name === 'HR Manager') || roles[0];
  const auditorRole = roles.find(r => r.name === 'Auditor') || roles[0];
  const cashierRole = roles.find(r => r.name === 'Cashier') || roles[0];
  const crmRole = roles.find(r => r.name === 'CRM Head') || roles[0];
  const focalRole = roles.find(r => r.name === 'Focal Agent') || roles[0];

  const users = await prisma.user.findMany();
  const userSuperAdmin = users.find(u => u.email === 'superadmin@coop.local');
  const userYonad = users.find(u => u.email === 'yonad@gmail.com');
  const userAdmin = users.find(u => u.email === 'admin@coop.local');
  const userCashier = users.find(u => u.email === 'cashier@coop.local');
  const userAgent1 = users.find(u => u.email === 'agent1@coop.local');
  const userAgent2 = users.find(u => u.email === 'agent2@coop.local');
  const userAgent3 = users.find(u => u.email === 'agent3@coop.local');
  const userLiyu = users.find(u => u.email === 'liyu@gmail.com');

  console.log(`Found ${branches.length} branches, ${roles.length} roles, ${users.length} users in system.`);

  // ── 1. Organizational Units (Multi-Level Hierarchy) ─────────────────────────
  console.log('🏢 Seeding Organization Units...');

  // Root: Executive Office
  const execDir = await prisma.hrOrganizationUnit.upsert({
    where: { code: 'EXEC-DIR' },
    update: { branchId: mainBranch?.id },
    create: {
      code: 'EXEC-DIR',
      name: 'Office of the Chief Executive Officer & Executive Board',
      unitType: 'division',
      costCenter: 'CC-001',
      branchId: mainBranch?.id,
      isActive: true,
    },
  });

  // Level 1 Directorates
  const ictDir = await prisma.hrOrganizationUnit.upsert({
    where: { code: 'ICT-DIR' },
    update: { parentId: execDir.id, branchId: mainBranch?.id },
    create: {
      code: 'ICT-DIR',
      name: 'ICT & Digital Banking Directorate',
      unitType: 'directorate',
      parentId: execDir.id,
      branchId: mainBranch?.id,
      costCenter: 'CC-101',
      isActive: true,
    },
  });

  const finDir = await prisma.hrOrganizationUnit.upsert({
    where: { code: 'FIN-DIR' },
    update: { parentId: execDir.id, branchId: mainBranch?.id },
    create: {
      code: 'FIN-DIR',
      name: 'Finance & Cooperative Banking Directorate',
      unitType: 'directorate',
      parentId: execDir.id,
      branchId: mainBranch?.id,
      costCenter: 'CC-201',
      isActive: true,
    },
  });

  const hrDir = await prisma.hrOrganizationUnit.upsert({
    where: { code: 'HR-DIR' },
    update: { parentId: execDir.id, branchId: mainBranch?.id },
    create: {
      code: 'HR-DIR',
      name: 'Human Resources & Corporate Governance Directorate',
      unitType: 'directorate',
      parentId: execDir.id,
      branchId: mainBranch?.id,
      costCenter: 'CC-301',
      isActive: true,
    },
  });

  // Level 2 Operational Departments
  const engDept = await prisma.hrOrganizationUnit.upsert({
    where: { code: 'ENG-DEPT' },
    update: { parentId: ictDir.id, branchId: mainBranch?.id },
    create: {
      code: 'ENG-DEPT',
      name: 'Core Banking & Software Engineering',
      unitType: 'department',
      parentId: ictDir.id,
      branchId: mainBranch?.id,
      costCenter: 'CC-102',
      isActive: true,
    },
  });

  const infraDept = await prisma.hrOrganizationUnit.upsert({
    where: { code: 'INFRA-DEPT' },
    update: { parentId: ictDir.id, branchId: mainBranch?.id },
    create: {
      code: 'INFRA-DEPT',
      name: 'Cloud Infrastructure & Cybersecurity',
      unitType: 'department',
      parentId: ictDir.id,
      branchId: mainBranch?.id,
      costCenter: 'CC-103',
      isActive: true,
    },
  });

  const accDept = await prisma.hrOrganizationUnit.upsert({
    where: { code: 'ACC-DEPT' },
    update: { parentId: finDir.id, branchId: mainBranch?.id },
    create: {
      code: 'ACC-DEPT',
      name: 'Financial Accounts & Cooperative Treasury',
      unitType: 'department',
      parentId: finDir.id,
      branchId: mainBranch?.id,
      costCenter: 'CC-202',
      isActive: true,
    },
  });

  const riskDept = await prisma.hrOrganizationUnit.upsert({
    where: { code: 'RISK-DEPT' },
    update: { parentId: finDir.id, branchId: mainBranch?.id },
    create: {
      code: 'RISK-DEPT',
      name: 'Credit Risk & Loan Portfolio Management',
      unitType: 'department',
      parentId: finDir.id,
      branchId: mainBranch?.id,
      costCenter: 'CC-203',
      isActive: true,
    },
  });

  const hrOpsDept = await prisma.hrOrganizationUnit.upsert({
    where: { code: 'HR-OPS' },
    update: { parentId: hrDir.id, branchId: mainBranch?.id },
    create: {
      code: 'HR-OPS',
      name: 'Talent Acquisition & Employee Operations',
      unitType: 'department',
      parentId: hrDir.id,
      branchId: mainBranch?.id,
      costCenter: 'CC-302',
      isActive: true,
    },
  });

  const lndDept = await prisma.hrOrganizationUnit.upsert({
    where: { code: 'LND-DEPT' },
    update: { parentId: hrDir.id, branchId: mainBranch?.id },
    create: {
      code: 'LND-DEPT',
      name: 'Learning & Organizational Capacity Development',
      unitType: 'department',
      parentId: hrDir.id,
      branchId: mainBranch?.id,
      costCenter: 'CC-303',
      isActive: true,
    },
  });

  // Branch Unit: Atote Branch Operations
  const atoteUnit = await prisma.hrOrganizationUnit.upsert({
    where: { code: 'ATOTE-OPS' },
    update: { parentId: execDir.id, branchId: atoteBranch?.id },
    create: {
      code: 'ATOTE-OPS',
      name: 'Atote Branch Banking Operations & Microcredit',
      unitType: 'department',
      parentId: execDir.id,
      branchId: atoteBranch?.id,
      costCenter: 'CC-BR-01',
      isActive: true,
    },
  });

  // ── 2. Job Grades ───────────────────────────────────────────────────────────
  console.log('📊 Seeding Job Grades...');
  const grade1 = await prisma.hrJobGrade.upsert({
    where: { name: 'Grade 1 - C-Suite Executive' },
    update: {},
    create: { name: 'Grade 1 - C-Suite Executive', level: 1, minSalary: 180000, midSalary: 215000, maxSalary: 250000 },
  });

  const grade2 = await prisma.hrJobGrade.upsert({
    where: { name: 'Grade 2 - Directorate Head / VP' },
    update: {},
    create: { name: 'Grade 2 - Directorate Head / VP', level: 2, minSalary: 130000, midSalary: 155000, maxSalary: 180000 },
  });

  const grade3 = await prisma.hrJobGrade.upsert({
    where: { name: 'Grade 3 - Department Manager' },
    update: {},
    create: { name: 'Grade 3 - Department Manager', level: 3, minSalary: 95000, midSalary: 110000, maxSalary: 130000 },
  });

  const grade4 = await prisma.hrJobGrade.upsert({
    where: { name: 'Grade 4 - Lead Specialist / Architect' },
    update: {},
    create: { name: 'Grade 4 - Lead Specialist / Architect', level: 4, minSalary: 75000, midSalary: 85000, maxSalary: 95000 },
  });

  const grade5 = await prisma.hrJobGrade.upsert({
    where: { name: 'Grade 5 - Senior Officer / Senior Engineer' },
    update: {},
    create: { name: 'Grade 5 - Senior Officer / Senior Engineer', level: 5, minSalary: 55000, midSalary: 65000, maxSalary: 75000 },
  });

  const grade6 = await prisma.hrJobGrade.upsert({
    where: { name: 'Grade 6 - Professional Officer' },
    update: {},
    create: { name: 'Grade 6 - Professional Officer', level: 6, minSalary: 40000, midSalary: 47500, maxSalary: 55000 },
  });

  // ── 3. Positions ────────────────────────────────────────────────────────────
  console.log('📌 Seeding Positions...');
  const posCeo = await prisma.hrPosition.upsert({
    where: { code: 'POS-CEO' },
    update: { defaultRoleId: superAdminRole?.id },
    create: {
      code: 'POS-CEO',
      title: 'Chief Executive Officer',
      departmentId: execDir.id,
      gradeId: grade1.id,
      defaultRoleId: superAdminRole?.id,
      budgetedHeadcount: 1,
      activeHeadcount: 1,
    },
  });

  const posDirIct = await prisma.hrPosition.upsert({
    where: { code: 'POS-DIR-ICT' },
    update: { defaultRoleId: adminRole?.id },
    create: {
      code: 'POS-DIR-ICT',
      title: 'Director of ICT & Digital Banking',
      departmentId: ictDir.id,
      gradeId: grade2.id,
      defaultRoleId: adminRole?.id,
      budgetedHeadcount: 1,
      activeHeadcount: 1,
    },
  });

  const posDirFin = await prisma.hrPosition.upsert({
    where: { code: 'POS-DIR-FIN' },
    update: { defaultRoleId: auditorRole?.id },
    create: {
      code: 'POS-DIR-FIN',
      title: 'Director of Finance & Cooperative Banking',
      departmentId: finDir.id,
      gradeId: grade2.id,
      defaultRoleId: auditorRole?.id,
      budgetedHeadcount: 1,
      activeHeadcount: 1,
    },
  });

  const posDirHr = await prisma.hrPosition.upsert({
    where: { code: 'POS-DIR-HR' },
    update: { defaultRoleId: hrRole?.id },
    create: {
      code: 'POS-DIR-HR',
      title: 'Director of Human Resources & Governance',
      departmentId: hrDir.id,
      gradeId: grade2.id,
      defaultRoleId: hrRole?.id,
      budgetedHeadcount: 1,
      activeHeadcount: 1,
    },
  });

  const posMgrEng = await prisma.hrPosition.upsert({
    where: { code: 'POS-MGR-ENG' },
    update: { defaultRoleId: adminRole?.id },
    create: {
      code: 'POS-MGR-ENG',
      title: 'Software Engineering Manager',
      departmentId: engDept.id,
      gradeId: grade3.id,
      defaultRoleId: adminRole?.id,
      budgetedHeadcount: 1,
      activeHeadcount: 1,
    },
  });

  const posMgrFin = await prisma.hrPosition.upsert({
    where: { code: 'POS-MGR-FIN' },
    update: { defaultRoleId: auditorRole?.id },
    create: {
      code: 'POS-MGR-FIN',
      title: 'Senior Financial Controller',
      departmentId: accDept.id,
      gradeId: grade3.id,
      defaultRoleId: auditorRole?.id,
      budgetedHeadcount: 1,
      activeHeadcount: 1,
    },
  });

  const posMgrHr = await prisma.hrPosition.upsert({
    where: { code: 'POS-MGR-HR' },
    update: { defaultRoleId: hrRole?.id },
    create: {
      code: 'POS-MGR-HR',
      title: 'HR Operations Manager',
      departmentId: hrOpsDept.id,
      gradeId: grade3.id,
      defaultRoleId: hrRole?.id,
      budgetedHeadcount: 1,
      activeHeadcount: 1,
    },
  });

  const posSrDev = await prisma.hrPosition.upsert({
    where: { code: 'POS-SR-DEV' },
    update: { defaultRoleId: adminRole?.id },
    create: {
      code: 'POS-SR-DEV',
      title: 'Senior Full-Stack Engineer',
      departmentId: engDept.id,
      gradeId: grade5.id,
      defaultRoleId: adminRole?.id,
      budgetedHeadcount: 3,
      activeHeadcount: 1,
    },
  });

  const posDevOps = await prisma.hrPosition.upsert({
    where: { code: 'POS-DEVOPS' },
    update: { defaultRoleId: adminRole?.id },
    create: {
      code: 'POS-DEVOPS',
      title: 'Cloud Infrastructure & Security Specialist',
      departmentId: infraDept.id,
      gradeId: grade5.id,
      defaultRoleId: adminRole?.id,
      budgetedHeadcount: 2,
      activeHeadcount: 1,
    },
  });

  const posRiskAnalyst = await prisma.hrPosition.upsert({
    where: { code: 'POS-RISK-ANALYST' },
    update: { defaultRoleId: auditorRole?.id },
    create: {
      code: 'POS-RISK-ANALYST',
      title: 'Credit Risk & Loan Analyst',
      departmentId: riskDept.id,
      gradeId: grade6.id,
      defaultRoleId: auditorRole?.id,
      budgetedHeadcount: 2,
      activeHeadcount: 1,
    },
  });

  const posLndSpecialist = await prisma.hrPosition.upsert({
    where: { code: 'POS-LND-SPEC' },
    update: { defaultRoleId: hrRole?.id },
    create: {
      code: 'POS-LND-SPEC',
      title: 'Talent & Capacity Building Specialist',
      departmentId: lndDept.id,
      gradeId: grade6.id,
      defaultRoleId: hrRole?.id,
      budgetedHeadcount: 2,
      activeHeadcount: 1,
    },
  });

  const posCashier = await prisma.hrPosition.upsert({
    where: { code: 'POS-CASHIER' },
    update: { defaultRoleId: cashierRole?.id },
    create: {
      code: 'POS-CASHIER',
      title: 'Branch Head Cashier & Vault Custodian',
      departmentId: atoteUnit.id,
      gradeId: grade6.id,
      defaultRoleId: cashierRole?.id,
      budgetedHeadcount: 2,
      activeHeadcount: 1,
    },
  });

  const posFocalAgent = await prisma.hrPosition.upsert({
    where: { code: 'POS-FOCAL-AGENT' },
    update: { defaultRoleId: focalRole?.id },
    create: {
      code: 'POS-FOCAL-AGENT',
      title: 'Branch Customer Service & Focal Agent',
      departmentId: atoteUnit.id,
      gradeId: grade6.id,
      defaultRoleId: focalRole?.id,
      budgetedHeadcount: 4,
      activeHeadcount: 2,
    },
  });

  // ── 4. Hierarchical Employees ───────────────────────────────────────────────
  console.log('👥 Seeding Employees with Multi-Level Reporting Lines...');

  // Top Executive: CEO
  const ceo = await prisma.hrEmployee.upsert({
    where: { email: 'ceo@coop.local' },
    update: {
      positionId: posCeo.id,
      departmentId: execDir.id,
      branchId: mainBranch?.id,
      userId: userSuperAdmin?.id,
      supervisorId: null,
    },
    create: {
      employeeNumber: 'EMP-2026-0001',
      firstName: 'Dr. Meron',
      lastName: 'Alemu',
      email: 'ceo@coop.local',
      phone: '+251911000001',
      gender: 'F',
      dateOfBirth: new Date('1975-06-15'),
      hireDate: new Date('2020-01-10'),
      employmentType: 'permanent',
      status: 'active',
      departmentId: execDir.id,
      positionId: posCeo.id,
      branchId: mainBranch?.id,
      userId: userSuperAdmin?.id,
      supervisorId: null,
      tinNumber: 'TIN-00192837',
      pensionNumber: 'PEN-88910',
      bankName: 'Cooperative Bank of Oromia',
      bankAccountNumber: '10009823412',
      emergencyContactName: 'Abeba Alemu (Sister)',
      emergencyContactPhone: '+251911554433',
      address: 'Bole Subcity, House 420, Addis Ababa',
    },
  });

  // Level 2: Directors (Report to CEO)
  const dirIctEmp = await prisma.hrEmployee.upsert({
    where: { email: 'yonad.h@coop.local' },
    update: {
      supervisorId: ceo.id,
      positionId: posDirIct.id,
      departmentId: ictDir.id,
      branchId: mainBranch?.id,
      userId: userYonad?.id,
    },
    create: {
      employeeNumber: 'EMP-2026-0002',
      firstName: 'Yonad',
      lastName: 'Haile',
      email: 'yonad.h@coop.local',
      phone: '+251912000002',
      gender: 'M',
      dateOfBirth: new Date('1984-04-20'),
      hireDate: new Date('2021-03-01'),
      employmentType: 'permanent',
      status: 'active',
      departmentId: ictDir.id,
      positionId: posDirIct.id,
      branchId: mainBranch?.id,
      userId: userYonad?.id,
      supervisorId: ceo.id,
      tinNumber: 'TIN-00284758',
      pensionNumber: 'PEN-88911',
      bankName: 'Cooperative Bank of Oromia',
      bankAccountNumber: '10009823413',
      emergencyContactName: 'Genet Haile (Spouse)',
      emergencyContactPhone: '+251912554434',
      address: 'Kirkos Subcity, Kazanchis, Addis Ababa',
    },
  });

  const dirFinEmp = await prisma.hrEmployee.upsert({
    where: { email: 'selamawit.b@coop.local' },
    update: {
      supervisorId: ceo.id,
      positionId: posDirFin.id,
      departmentId: finDir.id,
      branchId: mainBranch?.id,
    },
    create: {
      employeeNumber: 'EMP-2026-0003',
      firstName: 'Selamawit',
      lastName: 'Bekele',
      email: 'selamawit.b@coop.local',
      phone: '+251913000003',
      gender: 'F',
      dateOfBirth: new Date('1982-11-12'),
      hireDate: new Date('2021-04-15'),
      employmentType: 'permanent',
      status: 'active',
      departmentId: finDir.id,
      positionId: posDirFin.id,
      branchId: mainBranch?.id,
      supervisorId: ceo.id,
      tinNumber: 'TIN-00384950',
      pensionNumber: 'PEN-88912',
      bankName: 'Commercial Bank of Ethiopia',
      bankAccountNumber: '10007812984',
      emergencyContactName: 'Ermias Bekele (Brother)',
      emergencyContactPhone: '+251913554435',
      address: 'Yeka Subcity, Signal, Addis Ababa',
    },
  });

  const dirHrEmp = await prisma.hrEmployee.upsert({
    where: { email: 'dawit.t@coop.local' },
    update: {
      supervisorId: ceo.id,
      positionId: posDirHr.id,
      departmentId: hrDir.id,
      branchId: mainBranch?.id,
      userId: userAdmin?.id,
    },
    create: {
      employeeNumber: 'EMP-2026-0004',
      firstName: 'Dawit',
      lastName: 'Tadesse',
      email: 'dawit.t@coop.local',
      phone: '+251914000004',
      gender: 'M',
      dateOfBirth: new Date('1980-09-08'),
      hireDate: new Date('2021-06-01'),
      employmentType: 'permanent',
      status: 'active',
      departmentId: hrDir.id,
      positionId: posDirHr.id,
      branchId: mainBranch?.id,
      userId: userAdmin?.id,
      supervisorId: ceo.id,
      tinNumber: 'TIN-00485960',
      pensionNumber: 'PEN-88913',
      bankName: 'Dashen Bank',
      bankAccountNumber: '10006723910',
      emergencyContactName: 'Marta Tadesse (Spouse)',
      emergencyContactPhone: '+251914554436',
      address: 'Lideta Subcity, Addis Ababa',
    },
  });

  // Level 3: Department Managers (Report to Directors)
  const mgrEngEmp = await prisma.hrEmployee.upsert({
    where: { email: 'abebe.k@coop.local' },
    update: {
      supervisorId: dirIctEmp.id,
      positionId: posMgrEng.id,
      departmentId: engDept.id,
      branchId: mainBranch?.id,
    },
    create: {
      employeeNumber: 'EMP-2026-0005',
      firstName: 'Abebe',
      lastName: 'Kebede',
      email: 'abebe.k@coop.local',
      phone: '+251915000005',
      gender: 'M',
      dateOfBirth: new Date('1988-02-18'),
      hireDate: new Date('2022-01-15'),
      employmentType: 'permanent',
      status: 'active',
      departmentId: engDept.id,
      positionId: posMgrEng.id,
      branchId: mainBranch?.id,
      supervisorId: dirIctEmp.id,
      tinNumber: 'TIN-00586971',
      pensionNumber: 'PEN-88914',
      bankName: 'Cooperative Bank of Oromia',
      bankAccountNumber: '10009823415',
      emergencyContactName: 'Almaz Kebede (Sister)',
      emergencyContactPhone: '+251915554437',
      address: 'Nifas Silk Lafto, Jomo, Addis Ababa',
    },
  });

  const mgrFinEmp = await prisma.hrEmployee.upsert({
    where: { email: 'bethlehem.g@coop.local' },
    update: {
      supervisorId: dirFinEmp.id,
      positionId: posMgrFin.id,
      departmentId: accDept.id,
      branchId: mainBranch?.id,
    },
    create: {
      employeeNumber: 'EMP-2026-0006',
      firstName: 'Bethlehem',
      lastName: 'Girma',
      email: 'bethlehem.g@coop.local',
      phone: '+251916000006',
      gender: 'F',
      dateOfBirth: new Date('1989-08-25'),
      hireDate: new Date('2022-03-01'),
      employmentType: 'permanent',
      status: 'active',
      departmentId: accDept.id,
      positionId: posMgrFin.id,
      branchId: mainBranch?.id,
      supervisorId: dirFinEmp.id,
      tinNumber: 'TIN-00687982',
      pensionNumber: 'PEN-88915',
      bankName: 'Awash Bank',
      bankAccountNumber: '10004567891',
      emergencyContactName: 'Girma Wolde (Father)',
      emergencyContactPhone: '+251916554438',
      address: 'Bole Bulbula, Addis Ababa',
    },
  });

  const mgrHrEmp = await prisma.hrEmployee.upsert({
    where: { email: 'kidist.a@coop.local' },
    update: {
      supervisorId: dirHrEmp.id,
      positionId: posMgrHr.id,
      departmentId: hrOpsDept.id,
      branchId: mainBranch?.id,
    },
    create: {
      employeeNumber: 'EMP-2026-0007',
      firstName: 'Kidist',
      lastName: 'Assefa',
      email: 'kidist.a@coop.local',
      phone: '+251917000007',
      gender: 'F',
      dateOfBirth: new Date('1990-12-05'),
      hireDate: new Date('2022-05-10'),
      employmentType: 'permanent',
      status: 'active',
      departmentId: hrOpsDept.id,
      positionId: posMgrHr.id,
      branchId: mainBranch?.id,
      supervisorId: dirHrEmp.id,
      tinNumber: 'TIN-00788993',
      pensionNumber: 'PEN-88916',
      bankName: 'Commercial Bank of Ethiopia',
      bankAccountNumber: '10008923456',
      emergencyContactName: 'Assefa Bekele (Father)',
      emergencyContactPhone: '+251917554439',
      address: 'Arada Subcity, Piassa, Addis Ababa',
    },
  });

  // Level 4: Senior Engineers & Officers (Report to Managers)
  const tariku = await prisma.hrEmployee.upsert({
    where: { email: 'tariku.l@coop.local' },
    update: {
      supervisorId: mgrEngEmp.id,
      positionId: posSrDev.id,
      departmentId: engDept.id,
      branchId: mainBranch?.id,
      userId: userAgent1?.id,
    },
    create: {
      employeeNumber: 'EMP-2026-0008',
      firstName: 'Tariku',
      lastName: 'Lemma',
      email: 'tariku.l@coop.local',
      phone: '+251918000008',
      gender: 'M',
      dateOfBirth: new Date('1993-07-14'),
      hireDate: new Date('2023-01-15'),
      employmentType: 'permanent',
      status: 'active',
      departmentId: engDept.id,
      positionId: posSrDev.id,
      branchId: mainBranch?.id,
      userId: userAgent1?.id,
      supervisorId: mgrEngEmp.id,
      tinNumber: 'TIN-00889904',
      pensionNumber: 'PEN-88917',
      bankName: 'Cooperative Bank of Oromia',
      bankAccountNumber: '10009823418',
      emergencyContactName: 'Tigist Lemma (Sister)',
      emergencyContactPhone: '+251918554440',
      address: 'Akaki Kality, Addis Ababa',
    },
  });

  const hiwot = await prisma.hrEmployee.upsert({
    where: { email: 'hiwot.z@coop.local' },
    update: {
      supervisorId: mgrEngEmp.id,
      positionId: posDevOps.id,
      departmentId: infraDept.id,
      branchId: mainBranch?.id,
      userId: userAgent2?.id,
    },
    create: {
      employeeNumber: 'EMP-2026-0009',
      firstName: 'Hiwot',
      lastName: 'Zewde',
      email: 'hiwot.z@coop.local',
      phone: '+251919000009',
      gender: 'F',
      dateOfBirth: new Date('1994-03-30'),
      hireDate: new Date('2023-04-01'),
      employmentType: 'permanent',
      status: 'active',
      departmentId: infraDept.id,
      positionId: posDevOps.id,
      branchId: mainBranch?.id,
      userId: userAgent2?.id,
      supervisorId: mgrEngEmp.id,
      tinNumber: 'TIN-00990015',
      pensionNumber: 'PEN-88918',
      bankName: 'Wegagen Bank',
      bankAccountNumber: '10005612348',
      emergencyContactName: 'Zewde Desta (Father)',
      emergencyContactPhone: '+251919554441',
      address: 'Kolfe Keranio, Addis Ababa',
    },
  });

  const yared = await prisma.hrEmployee.upsert({
    where: { email: 'yared.f@coop.local' },
    update: {
      supervisorId: mgrFinEmp.id,
      positionId: posRiskAnalyst.id,
      departmentId: riskDept.id,
      branchId: atoteBranch?.id,
      userId: userAgent3?.id,
    },
    create: {
      employeeNumber: 'EMP-2026-0010',
      firstName: 'Yared',
      lastName: 'Fikru',
      email: 'yared.f@coop.local',
      phone: '+251920000010',
      gender: 'M',
      dateOfBirth: new Date('1995-10-10'),
      hireDate: new Date('2023-07-01'),
      employmentType: 'permanent',
      status: 'active',
      departmentId: riskDept.id,
      positionId: posRiskAnalyst.id,
      branchId: atoteBranch?.id,
      userId: userAgent3?.id,
      supervisorId: mgrFinEmp.id,
      tinNumber: 'TIN-01001126',
      pensionNumber: 'PEN-88919',
      bankName: 'Cooperative Bank of Oromia',
      bankAccountNumber: '10009823420',
      emergencyContactName: 'Rahel Fikru (Sister)',
      emergencyContactPhone: '+251920554442',
      address: 'Gullele Subcity, Addis Ababa',
    },
  });

  const tsion = await prisma.hrEmployee.upsert({
    where: { email: 'tsion.m@coop.local' },
    update: {
      supervisorId: mgrHrEmp.id,
      positionId: posLndSpecialist.id,
      departmentId: lndDept.id,
      branchId: atoteBranch?.id,
      userId: userLiyu?.id,
    },
    create: {
      employeeNumber: 'EMP-2026-0011',
      firstName: 'Tsion',
      lastName: 'Mekonnen',
      email: 'tsion.m@coop.local',
      phone: '+251921000011',
      gender: 'F',
      dateOfBirth: new Date('1996-01-22'),
      hireDate: new Date('2023-09-15'),
      employmentType: 'permanent',
      status: 'active',
      departmentId: lndDept.id,
      positionId: posLndSpecialist.id,
      branchId: atoteBranch?.id,
      userId: userLiyu?.id,
      supervisorId: mgrHrEmp.id,
      tinNumber: 'TIN-01112237',
      pensionNumber: 'PEN-88920',
      bankName: 'Dashen Bank',
      bankAccountNumber: '10007890123',
      emergencyContactName: 'Mekonnen Tulu (Father)',
      emergencyContactPhone: '+251921554443',
      address: 'Bole Subcity, Woreda 03, Addis Ababa',
    },
  });

  const cashierEmp = await prisma.hrEmployee.upsert({
    where: { email: 'cashier@coop.local' },
    update: {
      supervisorId: dirFinEmp.id,
      positionId: posCashier.id,
      departmentId: atoteUnit.id,
      branchId: mainBranch?.id,
      userId: userCashier?.id,
    },
    create: {
      employeeNumber: 'EMP-2026-0012',
      firstName: 'Mulugeta',
      lastName: 'Desta',
      email: 'cashier@coop.local',
      phone: '+251922000012',
      gender: 'M',
      dateOfBirth: new Date('1992-05-18'),
      hireDate: new Date('2023-11-01'),
      employmentType: 'permanent',
      status: 'active',
      departmentId: atoteUnit.id,
      positionId: posCashier.id,
      branchId: mainBranch?.id,
      userId: userCashier?.id,
      supervisorId: dirFinEmp.id,
      tinNumber: 'TIN-01223348',
      pensionNumber: 'PEN-88921',
      bankName: 'Cooperative Bank of Oromia',
      bankAccountNumber: '10009823425',
      emergencyContactName: 'Desta Mulugeta (Father)',
      emergencyContactPhone: '+251922554444',
      address: 'Nifas Silk, Addis Ababa',
    },
  });

  // Update managerIds on organization units
  await prisma.hrOrganizationUnit.update({ where: { id: execDir.id }, data: { managerId: ceo.id } });
  await prisma.hrOrganizationUnit.update({ where: { id: ictDir.id }, data: { managerId: dirIctEmp.id } });
  await prisma.hrOrganizationUnit.update({ where: { id: finDir.id }, data: { managerId: dirFinEmp.id } });
  await prisma.hrOrganizationUnit.update({ where: { id: hrDir.id }, data: { managerId: dirHrEmp.id } });
  await prisma.hrOrganizationUnit.update({ where: { id: engDept.id }, data: { managerId: mgrEngEmp.id } });
  await prisma.hrOrganizationUnit.update({ where: { id: accDept.id }, data: { managerId: mgrFinEmp.id } });
  await prisma.hrOrganizationUnit.update({ where: { id: hrOpsDept.id }, data: { managerId: mgrHrEmp.id } });
  await prisma.hrOrganizationUnit.update({ where: { id: atoteUnit.id }, data: { managerId: cashierEmp.id } });

  // ── 5. Leave Types ──────────────────────────────────────────────────────────
  console.log('🏖️ Seeding Leave Types...');
  const annualLeave = await prisma.hrLeaveType.upsert({
    where: { code: 'ANNUAL' },
    update: {},
    create: {
      code: 'ANNUAL',
      name: 'Annual Paid Vacation Leave',
      daysAllowed: 22,
      isPaid: true,
      allowCarryOver: true,
      maxCarryOverDays: 5,
    },
  });

  const sickLeave = await prisma.hrLeaveType.upsert({
    where: { code: 'SICK' },
    update: {},
    create: {
      code: 'SICK',
      name: 'Certified Medical Sick Leave',
      daysAllowed: 15,
      isPaid: true,
      requiresAttachment: true,
    },
  });

  const compLeave = await prisma.hrLeaveType.upsert({
    where: { code: 'COMPASSIONATE' },
    update: {},
    create: {
      code: 'COMPASSIONATE',
      name: 'Compassionate & Bereavement Leave',
      daysAllowed: 7,
      isPaid: true,
    },
  });

  const maternityLeave = await prisma.hrLeaveType.upsert({
    where: { code: 'MATERNITY' },
    update: {},
    create: {
      code: 'MATERNITY',
      name: 'Maternity Leave',
      daysAllowed: 120,
      isPaid: true,
    },
  });

  // ── 6. Leave Applications (Multi-Tier Hierarchical States) ──────────────────
  console.log('📝 Seeding Sample Leave Applications in Multi-Stage Workflows...');

  // Application 1: Tariku Lemma applied for leave -> PENDING supervisor review (Abebe Kebede)
  const existingApp1 = await prisma.hrLeaveApplication.findFirst({
    where: { employeeId: tariku.id, status: 'pending' },
  });
  if (!existingApp1) {
    await prisma.hrLeaveApplication.create({
      data: {
        employeeId: tariku.id,
        leaveTypeId: annualLeave.id,
        startDate: new Date('2026-10-05'),
        endDate: new Date('2026-10-09'),
        daysRequested: 5,
        reason: 'Annual family recharge and travel.',
        status: 'pending',
      },
    });
  }

  // Application 2: Hiwot Zewde applied -> APPROVED by supervisor (Abebe Kebede), PENDING HR sign-off
  const existingApp2 = await prisma.hrLeaveApplication.findFirst({
    where: { employeeId: hiwot.id, status: 'approved_supervisor' },
  });
  if (!existingApp2) {
    await prisma.hrLeaveApplication.create({
      data: {
        employeeId: hiwot.id,
        leaveTypeId: sickLeave.id,
        startDate: new Date('2026-09-28'),
        endDate: new Date('2026-09-30'),
        daysRequested: 3,
        reason: 'Dental surgery and prescribed recovery.',
        status: 'approved_supervisor',
        approvedById: mgrEngEmp.id,
      },
    });
  }

  // Application 3: Yonad Haile -> APPROVED HR (Completed)
  const existingApp3 = await prisma.hrLeaveApplication.findFirst({
    where: { employeeId: dirIctEmp.id, status: 'approved_hr' },
  });
  if (!existingApp3) {
    await prisma.hrLeaveApplication.create({
      data: {
        employeeId: dirIctEmp.id,
        leaveTypeId: annualLeave.id,
        startDate: new Date('2026-08-10'),
        endDate: new Date('2026-08-14'),
        daysRequested: 5,
        reason: 'Summer vacation.',
        status: 'approved_hr',
        approvedById: dirHrEmp.id,
      },
    });
  }

  // ── 7. Real-Time Daily Attendance Records ────────────────────────────────────
  console.log('⏰ Seeding Attendance Records...');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const now = new Date();
  const morning8am = new Date(today);
  morning8am.setHours(8, 15, 0, 0);

  const late9am = new Date(today);
  late9am.setHours(9, 10, 0, 0);

  // Tariku: Punctual check-in
  await prisma.hrAttendanceRecord.upsert({
    where: { employeeId_workDate: { employeeId: tariku.id, workDate: today } },
    update: {},
    create: {
      employeeId: tariku.id,
      workDate: today,
      checkIn: morning8am,
      status: 'present',
      source: 'web',
      notes: 'Punctual web punch.',
    },
  });

  // Hiwot: Late check-in
  await prisma.hrAttendanceRecord.upsert({
    where: { employeeId_workDate: { employeeId: hiwot.id, workDate: today } },
    update: {},
    create: {
      employeeId: hiwot.id,
      workDate: today,
      checkIn: late9am,
      status: 'late',
      source: 'web',
      notes: 'Heavy traffic delay on Ring Road.',
    },
  });

  // Abebe Kebede: Punctual check-in
  await prisma.hrAttendanceRecord.upsert({
    where: { employeeId_workDate: { employeeId: mgrEngEmp.id, workDate: today } },
    update: {},
    create: {
      employeeId: mgrEngEmp.id,
      workDate: today,
      checkIn: morning8am,
      status: 'present',
      source: 'web',
      notes: 'Standard morning punch.',
    },
  });

  // ── 8. Performance Cycles & Appraisals (PMS) ─────────────────────────────────
  console.log('🎯 Seeding Performance Cycles & Calibrated Appraisals...');
  const cycleQ3 = await prisma.hrPerformanceCycle.upsert({
    where: { id: 'c1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' },
    update: {},
    create: {
      id: 'c1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
      title: 'FY 2026 - Q3 Cooperative Performance Appraisal',
      cycleType: 'quarterly',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-09-30'),
      status: 'active',
    },
  });

  // Tariku: Self-submitted, pending manager evaluation
  const existingAppr1 = await prisma.hrPerformanceAppraisal.findFirst({
    where: { employeeId: tariku.id, cycleId: cycleQ3.id },
  });
  if (!existingAppr1) {
    await prisma.hrPerformanceAppraisal.create({
      data: {
        cycleId: cycleQ3.id,
        employeeId: tariku.id,
        evaluatorId: mgrEngEmp.id,
        selfScore: 92.0,
        managerScore: null,
        finalScore: null,
        rating: null,
        feedback: 'Delivered core transaction microservice with zero downtime. Mentored 2 junior engineers.',
        developmentPlan: 'Complete AWS Solutions Architect certification.',
        status: 'submitted',
      },
    });
  }

  // Bethlehem Girma: Fully calibrated by Selamawit Bekele (Outstanding)
  const existingAppr2 = await prisma.hrPerformanceAppraisal.findFirst({
    where: { employeeId: mgrFinEmp.id, cycleId: cycleQ3.id },
  });
  if (!existingAppr2) {
    await prisma.hrPerformanceAppraisal.create({
      data: {
        cycleId: cycleQ3.id,
        employeeId: mgrFinEmp.id,
        evaluatorId: dirFinEmp.id,
        selfScore: 94.0,
        managerScore: 96.0,
        finalScore: 95.4,
        rating: 'outstanding',
        feedback: 'Flawless closing of Q2 cooperative financial audit and implementation of automatic accruals.',
        developmentPlan: 'Attend executive leadership seminar in Nairobi.',
        status: 'finalized',
      },
    });
  }

  // ── 9. Training Programs & 24-Month Service Bonds ────────────────────────────
  console.log('🎓 Seeding Training Programs & Service Bonds...');
  const progCloud = await prisma.hrTrainingProgram.upsert({
    where: { id: 'd2c3b4a5-1e2f-3a4b-5c6d-7e8f9a0b1c2d' },
    update: {},
    create: {
      id: 'd2c3b4a5-1e2f-3a4b-5c6d-7e8f9a0b1c2d',
      title: 'Advanced Cloud Microservices & Distributed Ledger Security',
      provider: 'Pan-African Fintech Academy',
      category: 'Technical Engineering',
      startDate: new Date('2026-04-01'),
      endDate: new Date('2026-06-30'),
      budgetCost: 4500,
      bondMonths: 24, // 24-Month Service Bond!
      status: 'completed',
    },
  });

  const progRisk = await prisma.hrTrainingProgram.upsert({
    where: { id: 'e3d4c5b6-2f3a-4b5c-6d7e-8f9a0b1c2d3e' },
    update: {},
    create: {
      id: 'e3d4c5b6-2f3a-4b5c-6d7e-8f9a0b1c2d3e',
      title: 'IFRS 9 & Cooperative Credit Risk Prudential Standards',
      provider: 'East African Institute of Bankers',
      category: 'Finance & Compliance',
      startDate: new Date('2026-05-10'),
      endDate: new Date('2026-07-15'),
      budgetCost: 3200,
      bondMonths: 12,
      status: 'completed',
    },
  });

  // Enroll Tariku with 24-Month Service Bond
  const bondEndTariku = new Date('2028-06-30');
  const existingPart1 = await prisma.hrTrainingParticipant.findFirst({
    where: { employeeId: tariku.id, programId: progCloud.id },
  });
  if (!existingPart1) {
    await prisma.hrTrainingParticipant.create({
      data: {
        programId: progCloud.id,
        employeeId: tariku.id,
        completionStatus: 'completed',
        score: 95.0,
        bondStartDate: new Date('2026-06-30'),
        bondEndDate: bondEndTariku,
      },
    });
  }

  // Enroll Bethlehem with 12-Month Service Bond
  const bondEndBethlehem = new Date('2027-07-15');
  const existingPart2 = await prisma.hrTrainingParticipant.findFirst({
    where: { employeeId: mgrFinEmp.id, programId: progRisk.id },
  });
  if (!existingPart2) {
    await prisma.hrTrainingParticipant.create({
      data: {
        programId: progRisk.id,
        employeeId: mgrFinEmp.id,
        completionStatus: 'completed',
        score: 92.5,
        bondStartDate: new Date('2026-07-15'),
        bondEndDate: bondEndBethlehem,
      },
    });
  }

  // ── 10. Mobility (Promotions & Transfers) ───────────────────────────────────
  console.log('📈 Seeding Career Mobility & Promotions...');
  const existingMov = await prisma.hrEmployeeMovement.findFirst({
    where: { employeeId: tariku.id, movementType: 'promotion' },
  });
  if (!existingMov) {
    await prisma.hrEmployeeMovement.create({
      data: {
        employeeId: tariku.id,
        movementType: 'promotion',
        fromDepartmentId: engDept.id,
        toDepartmentId: engDept.id,
        fromPositionId: posSrDev.id,
        toPositionId: posSrDev.id,
        fromBranchId: mainBranch?.id,
        toBranchId: mainBranch?.id,
        fromRoleId: adminRole?.id,
        toRoleId: adminRole?.id,
        fromSalary: 65000,
        toSalary: 74000,
        effectiveDate: new Date('2026-10-01'),
        justification: 'Outstanding performance, completed 24-month cloud certification, lead developer on core banking API.',
        status: 'pending', // Awaiting HR / CEO Executive Authorization!
      },
    });
  }

  // Branch Transfer Movement: Hiwot Zewde from HQ to Atote Branch
  const existingTransfer = await prisma.hrEmployeeMovement.findFirst({
    where: { employeeId: hiwot.id, movementType: 'transfer' },
  });
  if (!existingTransfer) {
    await prisma.hrEmployeeMovement.create({
      data: {
        employeeId: hiwot.id,
        movementType: 'transfer',
        fromDepartmentId: infraDept.id,
        toDepartmentId: atoteUnit.id,
        fromPositionId: posDevOps.id,
        toPositionId: posFocalAgent.id,
        fromBranchId: mainBranch?.id,
        toBranchId: atoteBranch?.id,
        fromRoleId: adminRole?.id,
        toRoleId: focalRole?.id,
        fromSalary: 65000,
        toSalary: 68000,
        effectiveDate: new Date('2026-10-15'),
        justification: 'Branch digital banking expansion and technical focal point assignment.',
        status: 'pending',
      },
    });
  }

  // ── 11. Exit Clearance & Alumni ─────────────────────────────────────────────
  console.log('🚪 Seeding Exit Clearances & Alumni...');
  const existingClearance = await prisma.hrOffboardingClearance.findFirst({
    where: { employeeId: yared.id },
  });
  if (!existingClearance) {
    await prisma.hrOffboardingClearance.create({
      data: {
        employeeId: yared.id,
        separationReason: 'resignation',
        noticeDate: new Date('2026-09-01'),
        lastWorkingDate: new Date('2026-09-30'),
        itClearance: 'cleared',
        financeClearance: 'cleared',
        departmentClearance: 'cleared',
        hrClearance: 'pending', // Waiting for final HR Director sign-off!
        exitInterviewNotes: 'Pursuing international graduate studies. Excellent contributor, recommended for rehire.',
        rehireEligibility: 'eligible',
        status: 'in_progress',
      },
    });
  }

  // ── 12. Strategic Workforce Planning ────────────────────────────────────────
  console.log('📊 Seeding Workforce Planning...');
  const existingPlan = await prisma.hrWorkforcePlan.findFirst({
    where: { fiscalYear: 'FY2026/27', departmentId: engDept.id },
  });
  if (!existingPlan) {
    await prisma.hrWorkforcePlan.create({
      data: {
        fiscalYear: 'FY2026/27',
        departmentId: engDept.id,
        currentHeadcount: 2,
        requestedHeadcount: 5,
        approvedHeadcount: 4,
        budgetEstimate: 240000,
        justification: 'Scaling in-house mobile banking app and AI fraud detection microservice.',
        status: 'approved',
      },
    });
  }

  console.log('✅ HR Comprehensive Seeding Completed Successfully!');
}

seedHrComplete()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
