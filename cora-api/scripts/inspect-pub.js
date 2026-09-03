const s = require('../infra/signature');

(async () => {
    const q = `{ __type(name: "PublicSignature") { fields { name type { name ofType { name } } } } }`;
    const d = await s.graphql(q);
    console.log('=== PublicSignature fields ===');
    if (d.__type) d.__type.fields.forEach(f => console.log('  -', f.name, ':', f.type.name || f.type.ofType?.name));
    process.exit(0);
})();
