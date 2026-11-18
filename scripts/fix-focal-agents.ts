import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Fixing focal agents...');
  
  // Find all users with role focal_agent who don't have a FocalAgent record
  const users = await prisma.user.findMany({
    where: {
      role: 'focal_agent',
      focalAgent: null
    }
  });

  for (const user of users) {
    console.log(`Creating FocalAgent for ${user.email}...`);
    const focalAgent = await prisma.focalAgent.create({
      data: {
        userId: user.id,
        fullName: user.fullName || user.email.split('@')[0],
        phone: user.phone || 'N/A',
        region: user.address || null
      }
    });

    // Update members created by this user to link to this focal agent
    const result = await prisma.member.updateMany({
      where: {
        createdBy: user.id,
        focalAgentId: null
      },
      data: {
        focalAgentId: focalAgent.id
      }
    });
    
    console.log(`Linked ${result.count} members to FocalAgent ${focalAgent.fullName}`);
  }

  console.log('Done!');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
