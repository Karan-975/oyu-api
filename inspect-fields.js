const mysql = require('mysql2/promise');

(async () => {
  const connection = await mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '123456',
    database: 'oyu_green_db',
  });

  console.log('Connected to DB.');

  const [modules] = await connection.query('SELECT * FROM form_modules WHERE slug IN ("recce", "borehole_recce")');
  console.log('Modules:', modules);

  if (modules.length > 0) {
    const moduleId = modules[0].id;
    const [sections] = await connection.query('SELECT * FROM form_sections WHERE module_id = ? ORDER BY order_index', [moduleId]);
    console.log('Sections:', sections);

    for (const section of sections) {
      const [fields] = await connection.query('SELECT * FROM form_fields WHERE section_id = ? ORDER BY order_index', [section.id]);
      console.log(`\nSection: ${section.title} (${section.id})`);
      for (const field of fields) {
        const [options] = await connection.query('SELECT * FROM field_options WHERE field_id = ? ORDER BY order_index', [field.id]);
        console.log(`  Field: ${field.label} (${field.field_key}) - type: ${field.field_type}, required: ${field.is_required}`);
        if (options.length > 0) {
          console.log(`    Options:`, options.map(o => `${o.label} => ${o.value} (score: ${o.score})`));
        }
      }
    }
  }

  await connection.end();
})();
