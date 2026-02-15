
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
    try {
        console.log('Connecting to DB...');
        // verify connection
        await prisma.$connect();
        console.log('Connected.');

        // Get a user and vault
        const user = await prisma.user.findFirst();
        if (!user) {
            console.log('No user found');
            return;
        }
        const vault = await prisma.vault.findFirst({
            where: { ownerId: user.id }
        });

        if (!vault) {
            console.log('No vault found for user');
            return;
        }

        console.log('Attempting to create Note source directly...');
        const source = await prisma.source.create({
            data: {
                vaultId: vault.id,
                type: 'note',
                title: 'Direct DB Test',
                content: 'Content from direct debug script',
                addedBy: user.id
            }
        });

        console.log('Success! Created source:', source);

    } catch (error) {
        console.error('DB Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

test();
