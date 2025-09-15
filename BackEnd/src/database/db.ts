import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const database = new Sequelize(
  process.env.DB_NAME as string,
  process.env.DB_USER as string,
  process.env.DB_PASSWORD as string,
  {
    host: process.env.DB_HOST || 'localhost',
    dialect: 'postgres',
    port: parseInt(process.env.DB_PORT || '5432'),
    logging: false, // optional: disables SQL logs
  }
);
// }
if(process.env.DB_SKIP === "false"){
database.authenticate()
  .then(async () => {
    console.log('Connection to the database has been established.');
  })
  .catch((error) => {
    console.error('Unable to connect to the database:', error);
  });
}


export default database;
