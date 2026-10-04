import { connect } from './lib/connect';

const main = async () => {
    const connection = await connect();
    try {
        await connection.migrate();
        console.log(`Migrations applied to ${connection.label}.`);
    } finally {
        await connection.close();
    }
};

main().catch((error) => { console.error(error); process.exitCode = 1; });
