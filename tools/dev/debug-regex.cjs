const re = /datetime\(\s*'now'\s*,\s*'(-?\s*\d+\s+\w+)'\s*\)/gi;
const input = `AND created_at < datetime('now', '-24 hours')`;
const match = re.exec(input);
console.log('input:', input);
console.log('match:', match);
console.log('captured:', match?.[1]);

// Test alternativo
const re2 = /datetime\(\s*'now'\s*,\s*'([^']+)'\s*\)/gi;
const m2 = re2.exec(input);
console.log('\nalternative match:', m2);
console.log('captured:', m2?.[1]);
