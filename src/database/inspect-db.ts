import { query, execute } from '../config/database';

async function main() {
  try {
    // 1. Restore the deleted user
    await execute('UPDATE users SET deleted_at = NULL WHERE email = "ngo_team_member@oyugreen.com"');
    console.log('Restored user ngo_team_member@oyugreen.com');

    // 2. Get user IDs
    const users = await query('SELECT id, email FROM users WHERE email IN ("ngo_team_member@oyugreen.com", "ngomember@oyugreen.com") AND deleted_at IS NULL');
    console.log('Target Users:', users);

    // 3. Get all boreholes
    const boreholes = await query('SELECT id, borehole_code FROM boreholes WHERE deleted_at IS NULL');
    console.log(`Found ${boreholes.length} boreholes`);

    const modules = ['borehole_recce', 'baseline_survey', 'lsc_survey', 'monitoring_survey', 'rehabilitation', 'grievance'];

    // 4. Assign
    for (const u of users) {
      console.log(`Assigning boreholes to ${u.email} (${u.id})...`);
      
      // Delete old active user assignments for this user
      await execute('DELETE FROM borehole_assignments WHERE assignee_type = "user" AND assignee_id = ?', [u.id]);

      for (const b of boreholes) {
        // Ensure the borehole is assigned to the NGO too
        await execute('UPDATE boreholes SET assigned_ngo_id = "959345ba-5f94-49ed-bd0d-7600b5a0a4e6" WHERE id = ?', [b.id]);
        
        // NGO assignment record
        await execute(`
          INSERT IGNORE INTO borehole_assignments (id, borehole_id, assignee_type, assignee_id, assigned_by, status)
          VALUES (UUID(), ?, 'ngo', '959345ba-5f94-49ed-bd0d-7600b5a0a4e6', 'd1f2f461-a497-451a-bfd6-c3277654839f', 'active')
        `, [b.id]);

        // User assignment for each module
        for (const mod of modules) {
          await execute(`
            INSERT INTO borehole_assignments (id, borehole_id, assignee_type, assignee_id, assigned_by, status, module, reason)
            VALUES (UUID(), ?, 'user', ?, '4c4feaca-ae61-4891-82a5-002d288accd9', 'active', ?, 'Assigned for E2E testing')
          `, [b.id, u.id, mod]);
        }
      }
    }

    console.log('Assignments completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
