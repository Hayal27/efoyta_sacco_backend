import { Router } from 'express';
import { analyticsRouter } from './analytics/analytics.routes';
import { teamRouter } from './team/team.routes';
import { orgRouter } from './org/org.routes';
import { employeesRouter } from './employees/employees.routes';
import { leaveRouter } from './leave/leave.routes';
import { attendanceRouter } from './attendance/attendance.routes';
import { performanceRouter } from './performance/performance.routes';
import { movementsRouter } from './movements/movements.routes';
import { trainingRouter } from './training/training.routes';
import { planningRouter } from './planning/planning.routes';
import { offboardingRouter } from './offboarding/offboarding.routes';

export const hrRouter = Router();

hrRouter.use('/analytics', analyticsRouter);
hrRouter.use('/team', teamRouter);
hrRouter.use('/org', orgRouter);
hrRouter.use('/employees', employeesRouter);
hrRouter.use('/leave', leaveRouter);
hrRouter.use('/attendance', attendanceRouter);
hrRouter.use('/performance', performanceRouter);
hrRouter.use('/movements', movementsRouter);
hrRouter.use('/training', trainingRouter);
hrRouter.use('/planning', planningRouter);
hrRouter.use('/offboarding', offboardingRouter);

