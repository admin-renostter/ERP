const s = require('../infra/signature');

(async () => {
    const query = `{ __type(name: "Document") { fields { name type { name ofType { name kind ofType { name } } } } } }`;
    const data = await s.graphql(query);
    console.log('=== Document fields ===');
    if (data.__type) {
        data.__type.fields.forEach(f => {
            const t = f.type;
            const name = t.name || t.ofType?.name || (t.ofType?.ofType ? t.ofType.ofType.name : '?');
            console.log('  -', f.name, ':', name);
        });
    }
    process.exit(0);
})();
