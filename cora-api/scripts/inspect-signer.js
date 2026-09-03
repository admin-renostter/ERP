const s = require('../infra/signature');

(async () => {
    const q1 = `{ __type(name: "SignerHistory") { fields { name type { name ofType { name } } } } }`;
    const d1 = await s.graphql(q1);
    console.log('=== SignerHistory fields ===');
    if (d1.__type) d1.__type.fields.forEach(f => console.log('  -', f.name, ':', f.type.name || f.type.ofType?.name));

    const q2 = `{ __type(name: "Signer") { fields { name type { name ofType { name } } } } }`;
    const d2 = await s.graphql(q2);
    console.log('\n=== Signer fields ===');
    if (d2.__type) d2.__type.fields.forEach(f => console.log('  -', f.name, ':', f.type.name || f.type.ofType?.name));
    process.exit(0);
})();
