import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Set up Sequelize connection
// if(process.env.NODE_ENV === "production"){
// const sequelize = new Sequelize(
//   process.env.DATABASE_URL!, // Render provides this
//   {
//     dialect: 'postgres',
//     dialectOptions: {
//       ssl:  {
//         require: true, rejectUnauthorized: false  // Render needs SSL
//     }, // Disable SSL for local dev
//     },
//     logging: false, // Disable SQL logs in production
// //   }
// // );
// } else {
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
