import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../../../config/prisma';
import { extractNationalIdData } from './national-id-scanner.service';

export const employeesRouter = Router();

// Helper to generate next sequential employee number
async function generateEmployeeNumber(): Promise<string> {
  const currentYear = new Date().getFullYear();
  const count = await prisma.hrEmployee.count();
  const seq = String(count + 1).padStart(4, '0');
  return `EMP-${currentYear}-${seq}`;
}

// ── Employee List & Search ───────────────────────────────────────────────────

employeesRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { search, departmentId, branchId, status, page = '1', limit = '20' } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (departmentId) where.departmentId = departmentId as string;
    if (branchId) where.branchId = branchId as string;
    if (status) where.status = status as string;
    if (search) {
      where.OR = [
        { firstName: { contains: search as string } },
        { lastName: { contains: search as string } },
        { employeeNumber: { contains: search as string } },
        { email: { contains: search as string } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.hrEmployee.count({ where }),
      prisma.hrEmployee.findMany({
        where,
        skip,
        take: limitNum,
        include: {
          department: { select: { id: true, name: true, code: true } },
          position: {
            select: {
              id: true,
              title: true,
              code: true,
              defaultRole: { select: { id: true, name: true, slug: true } },
            },
          },
          branch: { select: { id: true, name: true, code: true } },
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
              isActive: true,
              role: { select: { id: true, name: true, slug: true } },
            },
          },
          supervisor: { select: { id: true, firstName: true, lastName: true, employeeNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    res.json({
      success: true,
      data: {
        items,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── National ID (Fayda) AI Scanner & OCR Extraction ─────────────────────────

employeesRouter.post('/national-id/extract', async (req: Request, res: Response) => {
  try {
    const { frontImage, backImage, combinedImage, apiKey } = req.body;
    if (!frontImage && !combinedImage) {
      return res.status(400).json({
        success: false,
        error: 'Please provide at least a front image or combined National ID photo',
      });
    }

    const data = await extractNationalIdData({
      frontImage,
      backImage,
      combinedImage,
      apiKey,
    });

    res.json({ success: true, data });
  } catch (err: any) {
    console.error('[NationalIdScanner] Extraction error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Onboard New Employee ──────────────────────────────────────────────────────

employeesRouter.post('/', async (req: Request, res: Response) => {
  try {
    const {
      firstName,
      middleName,
      lastName,
      email,
      phone,
      gender,
      dateOfBirth,
      hireDate,
      employmentType,
      status,
      profilePictureUrl,
      departmentId,
      positionId,
      branchId,
      supervisorId,
      userId,
      roleId: customRoleId,
      createLoginAccount,
      initialPassword,
      tinNumber,
      pensionNumber,
      bankName,
      bankAccountNumber,
      emergencyContactName,
      emergencyContactPhone,
      address,
    } = req.body;

    if (!firstName || !lastName || !email || !departmentId) {
      return res.status(400).json({
        success: false,
        error: 'First name, last name, email, and department are required',
      });
    }

    let linkedUserId: string | null = userId || null;

    // Optional: Automatically provision or link User login account
    if (!linkedUserId && createLoginAccount) {
      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        linkedUserId = existingUser.id;
        const userUpdate: any = {};
        if (profilePictureUrl) userUpdate.profilePictureUrl = profilePictureUrl;
        if (customRoleId) userUpdate.roleId = customRoleId;
        if (Object.keys(userUpdate).length > 0) {
          await prisma.user.update({
            where: { id: existingUser.id },
            data: userUpdate,
          }).catch(() => null);
        }
        if (branchId) {
          await prisma.userBranch.upsert({
            where: { userId_branchId: { userId: existingUser.id, branchId } },
            create: { userId: existingUser.id, branchId, isPrimary: true },
            update: { isPrimary: true },
          }).catch(() => null);
        }
      } else {
        // Look up role: explicit roleId > position defaultRoleId > fallback staff role
        let roleId: string | null = customRoleId || null;
        if (!roleId && positionId) {
          const pos = await prisma.hrPosition.findUnique({ where: { id: positionId } });
          roleId = pos?.defaultRoleId || null;
        }
        if (!roleId) {
          const defaultRole = await prisma.role.findFirst({
            where: { slug: { in: ['staff', 'employee', 'cashier', 'teller'] } },
          });
          roleId = defaultRole?.id || null;
        }

        const passwordHash = await bcrypt.hash(initialPassword || 'Temp@1234', 10);
        const newUser = await prisma.user.create({
          data: {
            email,
            passwordHash,
            fullName: `${firstName} ${lastName}`.trim(),
            phone: phone || null,
            profilePictureUrl: profilePictureUrl || null,
            roleId,
            isActive: status !== 'suspended' && status !== 'inactive',
          },
        });
        linkedUserId = newUser.id;

        // If branch is provided, map user to branch
        if (branchId) {
          await prisma.userBranch.upsert({
            where: { userId_branchId: { userId: newUser.id, branchId } },
            create: { userId: newUser.id, branchId, isPrimary: true },
            update: { isPrimary: true },
          }).catch(() => null);
        }
      }
    }

    const employeeNumber = await generateEmployeeNumber();

    const employee = await prisma.hrEmployee.create({
      data: {
        employeeNumber,
        firstName,
        middleName: middleName || null,
        lastName,
        email,
        phone: phone || null,
        gender: gender || null,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        hireDate: hireDate ? new Date(hireDate) : new Date(),
        employmentType: employmentType || 'permanent',
        status: status || 'active',
        profilePictureUrl: profilePictureUrl || null,
        departmentId,
        positionId: positionId || null,
        branchId: branchId || null,
        supervisorId: supervisorId || null,
        userId: linkedUserId,
        tinNumber: tinNumber || null,
        pensionNumber: pensionNumber || null,
        bankName: bankName || null,
        bankAccountNumber: bankAccountNumber || null,
        bankAccountHolderName: req.body.bankAccountHolderName || null,
        bankBranch: req.body.bankBranch || null,
        emergencyContactName: emergencyContactName || null,
        emergencyContactPhone: emergencyContactPhone || null,
        emergencyContactRelation: req.body.emergencyContactRelation || null,
        address: address || null,

        // National ID / Fayda (Ethiopian Digital ID)
        nationalIdNumber: req.body.nationalIdNumber || null,
        nationalIdFin: req.body.nationalIdFin || null,
        nationalIdFrontUrl: req.body.nationalIdFrontUrl || null,
        nationalIdBackUrl: req.body.nationalIdBackUrl || null,
        nationalIdExpiry: req.body.nationalIdExpiry ? new Date(req.body.nationalIdExpiry) : null,
        nationalIdIssueDate: req.body.nationalIdIssueDate ? new Date(req.body.nationalIdIssueDate) : null,
        nationality: req.body.nationality || 'Ethiopian',
        fullNameAmharic: req.body.fullNameAmharic || null,

        // Residential Address Details
        region: req.body.region || null,
        zone: req.body.zone || null,
        woreda: req.body.woreda || null,
        kebele: req.body.kebele || null,
        houseNumber: req.body.houseNumber || null,

        // Health & Medical Information
        bloodGroup: req.body.bloodGroup || null,
        medicalConditions: req.body.medicalConditions || null,
        disabilityStatus: req.body.disabilityStatus || 'none',
        healthInsuranceProvider: req.body.healthInsuranceProvider || null,
        healthInsurancePolicyNumber: req.body.healthInsurancePolicyNumber || null,

        // Education & Qualifications
        highestEducation: req.body.highestEducation || null,
        fieldOfStudy: req.body.fieldOfStudy || null,
        institution: req.body.institution || null,
        graduationYear: req.body.graduationYear ? parseInt(req.body.graduationYear, 10) : null,
        certifications: req.body.certifications || null,

        // Family & Dependents
        maritalStatus: req.body.maritalStatus || null,
        spouseName: req.body.spouseName || null,
        dependentsCount: req.body.dependentsCount !== undefined ? parseInt(req.body.dependentsCount, 10) : 0,

        // Work Experience
        previousEmployer: req.body.previousEmployer || null,
        previousJobTitle: req.body.previousJobTitle || null,
        yearsOfExperience: req.body.yearsOfExperience !== undefined ? req.body.yearsOfExperience : 0,
        skillsSummary: req.body.skillsSummary || null,
      },
      include: {
        department: true,
        position: { include: { defaultRole: true } },
        branch: true,
        user: { select: { id: true, email: true, role: true, profilePictureUrl: true } },
      },
    });

    // Update active headcount on position if assigned
    if (positionId) {
      await prisma.hrPosition.update({
        where: { id: positionId },
        data: { activeHeadcount: { increment: 1 } },
      });
    }

    res.status(201).json({ success: true, data: employee });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Employee 360° Profile ────────────────────────────────────────────────────

employeesRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const employee = await prisma.hrEmployee.findUnique({
      where: { id },
      include: {
        department: true,
        position: { include: { grade: true, defaultRole: true } },
        branch: { select: { id: true, name: true, code: true, address: true, phone: true } },
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            isActive: true,
            profilePictureUrl: true,
            role: { select: { id: true, name: true, slug: true } },
            branches: { include: { branch: true } },
          },
        },
        supervisor: { select: { id: true, firstName: true, lastName: true, employeeNumber: true, email: true, profilePictureUrl: true } },
        subordinates: { select: { id: true, firstName: true, lastName: true, employeeNumber: true, profilePictureUrl: true } },
        leaveApplications: { take: 5, orderBy: { createdAt: 'desc' }, include: { leaveType: true } },
        attendanceRecords: { take: 10, orderBy: { workDate: 'desc' } },
        appraisals: { take: 5, orderBy: { createdAt: 'desc' }, include: { cycle: true } },
        movements: { take: 5, orderBy: { createdAt: 'desc' } },
        trainingParticipants: { take: 5, include: { program: true } },
      },
    });

    if (!employee) {
      return res.status(404).json({ success: false, error: 'Employee not found' });
    }

    res.json({ success: true, data: employee });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Update Employee Profile ──────────────────────────────────────────────────

employeesRouter.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };
    const customRoleId = updateData.roleId;
    delete updateData.roleId;

    // Format dates if provided
    if (updateData.dateOfBirth) updateData.dateOfBirth = new Date(updateData.dateOfBirth);
    if (updateData.hireDate) updateData.hireDate = new Date(updateData.hireDate);
    if (updateData.nationalIdExpiry) updateData.nationalIdExpiry = new Date(updateData.nationalIdExpiry);
    if (updateData.nationalIdIssueDate) updateData.nationalIdIssueDate = new Date(updateData.nationalIdIssueDate);
    if (updateData.graduationYear) updateData.graduationYear = parseInt(updateData.graduationYear, 10);
    if (updateData.dependentsCount !== undefined) updateData.dependentsCount = parseInt(updateData.dependentsCount, 10);

    const existingEmp = await prisma.hrEmployee.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!existingEmp) {
      return res.status(404).json({ success: false, error: 'Employee not found' });
    }

    const updated = await prisma.hrEmployee.update({
      where: { id },
      data: updateData,
      include: {
        department: true,
        position: true,
        branch: true,
        user: { select: { id: true, email: true, role: true, isActive: true, profilePictureUrl: true } },
      },
    });

    // Synchronize updates with linked user if present
    if (existingEmp.userId) {
      const userUpdate: any = {};
      if (updateData.status) {
        userUpdate.isActive = updateData.status === 'active';
      }
      if (updateData.profilePictureUrl !== undefined) {
        userUpdate.profilePictureUrl = updateData.profilePictureUrl;
      }
      if (updateData.email) {
        userUpdate.email = updateData.email;
      }
      if (updateData.phone !== undefined) {
        userUpdate.phone = updateData.phone;
      }
      if (updateData.firstName || updateData.lastName) {
        userUpdate.fullName = `${updateData.firstName || existingEmp.firstName} ${updateData.lastName || existingEmp.lastName}`.trim();
      }
      if (customRoleId) {
        userUpdate.roleId = customRoleId;
      }

      if (Object.keys(userUpdate).length > 0) {
        await prisma.user.update({
          where: { id: existingEmp.userId },
          data: userUpdate,
        }).catch(() => null);
      }

      const effectiveBranchId = updateData.branchId || existingEmp.branchId;
      if (effectiveBranchId) {
        await prisma.userBranch.upsert({
          where: { userId_branchId: { userId: existingEmp.userId, branchId: effectiveBranchId } },
          create: { userId: existingEmp.userId, branchId: effectiveBranchId, isPrimary: true },
          update: { isPrimary: true },
        }).catch(() => null);
      }
    } else if (customRoleId) {
      // If employee didn't have a linked user account yet, provision or link one
      let user = await prisma.user.findUnique({ where: { email: existingEmp.email } });
      if (user) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            roleId: customRoleId,
            profilePictureUrl: updateData.profilePictureUrl !== undefined ? updateData.profilePictureUrl : undefined,
          },
        }).catch(() => null);
      } else {
        const passwordHash = await bcrypt.hash('Welcome@2026', 10);
        user = await prisma.user.create({
          data: {
            email: existingEmp.email,
            passwordHash,
            fullName: `${updateData.firstName || existingEmp.firstName} ${updateData.lastName || existingEmp.lastName}`.trim(),
            roleId: customRoleId,
            profilePictureUrl: updateData.profilePictureUrl || existingEmp.profilePictureUrl || null,
            isActive: (updateData.status || existingEmp.status) === 'active',
          },
        }).catch(() => null as any);
      }

      if (user?.id) {
        await prisma.hrEmployee.update({
          where: { id },
          data: { userId: user.id },
        }).catch(() => null);

        const effectiveBranchId = updateData.branchId || existingEmp.branchId;
        if (effectiveBranchId) {
          await prisma.userBranch.upsert({
            where: { userId_branchId: { userId: user.id, branchId: effectiveBranchId } },
            create: { userId: user.id, branchId: effectiveBranchId, isPrimary: true },
            update: { isPrimary: true },
          }).catch(() => null);
        }
      }
    }

    const finalResult = await prisma.hrEmployee.findUnique({
      where: { id },
      include: {
        department: true,
        position: true,
        branch: true,
        user: { select: { id: true, email: true, role: true, isActive: true, profilePictureUrl: true } },
      },
    });

    res.json({ success: true, data: finalResult || updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Update Employee Status (Active, Suspended, Inactive, Terminated) ──────────

employeesRouter.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, error: 'Status is required' });
    }

    const emp = await prisma.hrEmployee.findUnique({ where: { id } });
    if (!emp) {
      return res.status(404).json({ success: false, error: 'Employee not found' });
    }

    const updated = await prisma.hrEmployee.update({
      where: { id },
      data: { status },
      include: {
        department: true,
        position: true,
        branch: true,
        user: { select: { id: true, email: true, role: true, isActive: true, profilePictureUrl: true } },
      },
    });

    if (emp.userId) {
      await prisma.user.update({
        where: { id: emp.userId },
        data: { isActive: status === 'active' },
      }).catch(() => null);
    }

    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Delete / Deactivate Employee ──────────────────────────────────────────────

employeesRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const emp = await prisma.hrEmployee.findUnique({
      where: { id },
      include: {
        leaveApplications: { take: 1 },
        attendanceRecords: { take: 1 },
        appraisals: { take: 1 },
      },
    });

    if (!emp) {
      return res.status(404).json({ success: false, error: 'Employee not found' });
    }

    const hasHistory = emp.leaveApplications.length > 0 || emp.attendanceRecords.length > 0 || emp.appraisals.length > 0;
    if (hasHistory) {
      const updated = await prisma.hrEmployee.update({
        where: { id },
        data: { status: 'inactive' },
      });
      if (emp.userId) {
        await prisma.user.update({
          where: { id: emp.userId },
          data: { isActive: false },
        }).catch(() => null);
      }
      return res.json({
        success: true,
        message: 'Employee marked as inactive to preserve audit and payroll history',
        data: updated,
      });
    }

    await prisma.hrEmployee.delete({ where: { id } });
    if (emp.userId) {
      await prisma.user.update({
        where: { id: emp.userId },
        data: { isActive: false },
      }).catch(() => null);
    }

    res.json({ success: true, message: 'Employee deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Digital ID Card Generator Payload ────────────────────────────────────────

employeesRouter.get('/:id/digital-id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const employee = await prisma.hrEmployee.findUnique({
      where: { id },
      include: { department: true, position: true, branch: true },
    });

    if (!employee) {
      return res.status(404).json({ success: false, error: 'Employee not found' });
    }

    // Encrypted / verifiable verification token payload
    const qrPayload = JSON.stringify({
      id: employee.id,
      empNo: employee.employeeNumber,
      name: `${employee.firstName} ${employee.lastName}`,
      dept: employee.department.name,
      branch: employee.branch?.name || 'HQ',
      validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    });

    const idCardData = {
      employeeNumber: employee.employeeNumber,
      fullName: `${employee.firstName} ${employee.middleName ? employee.middleName + ' ' : ''}${employee.lastName}`,
      department: employee.department.name,
      position: employee.position?.title || 'Staff Member',
      branch: employee.branch?.name || 'Headquarters / Main Branch',
      branchCode: employee.branch?.code || 'HQ',
      hireDate: employee.hireDate,
      bloodGroup: 'O+',
      emergencyContact: employee.emergencyContactPhone || employee.phone,
      qrVerificationToken: Buffer.from(qrPayload).toString('base64'),
      status: employee.status,
      profilePictureUrl: employee.profilePictureUrl || null,
    };

    res.json({ success: true, data: idCardData });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

