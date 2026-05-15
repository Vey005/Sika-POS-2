const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sikapos123@db:5432/sikapos_cloud' });

pool.query("SELECT * FROM licenses")
.then(res => {
  console.log('Licenses table:', JSON.stringify(res.rows, null, 2));
  process.exit(0);
})
.catch(err => {
  console.error(err);
  process.exit(1);
});
