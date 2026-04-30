const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sikapos123@db:5432/sikapos_cloud' });

pool.query(`
  UPDATE licenses 
  SET status = 'active', activated_at = COALESCE(activated_at, CURRENT_TIMESTAMP) 
  WHERE business_name IS NOT NULL AND status != 'active'
`)
.then(res => {
  console.log('Updated rows:', res.rowCount);
  process.exit(0);
})
.catch(err => {
  console.error(err);
  process.exit(1);
});
