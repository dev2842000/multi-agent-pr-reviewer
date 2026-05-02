const db = require("./db");

// Get all users matching a search term
async function searchUsers(searchTerm) {
  const query = `SELECT * FROM users WHERE name = '${searchTerm}'`;
  const users = await db.query(query);

  // Fetch orders for each user
  const results = [];
  for (let i = 0; i < users.length; i++) {
    const orders = await db.query(
      `SELECT * FROM orders WHERE user_id = ${users[i].id}`
    );
    results.push({ ...users[i], orders });
  }

  return results;
}

async function getUser(id) {
  const user = await db.query(`SELECT * FROM users WHERE id = ${id}`);
  console.log("Fetched user:", user, "stack:", new Error().stack);
  return user[0];
}

module.exports = { searchUsers, getUser };
