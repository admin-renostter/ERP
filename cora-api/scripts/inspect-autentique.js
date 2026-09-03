const s = require('../infra/signature');

(async () => {
    const query = `{
        __schema {
            mutationType {
                fields {
                    name
                    args { name type { kind name ofType { kind name ofType { kind name } } } }
                }
            }
            queryType {
                fields { name }
            }
        }
    }`;

    const data = await s.graphql(query);
    const m = data.__schema.mutationType.fields.find(f => f.name === 'createDocument');
    console.log('=== createDocument args ===');
    if (m) m.args.forEach(a => {
        const typeName = a.type.name || a.type.ofType?.name || (a.type.ofType?.ofType ? a.type.ofType.ofType.name : '?');
        console.log('  -', a.name, ':', typeName, '(' + a.type.kind + ')');
    });

    const m2 = data.__schema.mutationType.fields.find(f => f.name === 'createSigner');
    console.log('\n=== createSigner args ===');
    if (m2) m2.args.forEach(a => {
        const typeName = a.type.name || a.type.ofType?.name || (a.type.ofType?.ofType ? a.type.ofType.ofType.name : '?');
        console.log('  -', a.name, ':', typeName, '(' + a.type.kind + ')');
    });

    const m3 = data.__schema.mutationType.fields.find(f => f.name === 'resendSignatures');
    console.log('\n=== resendSignatures args ===');
    if (m3) m3.args.forEach(a => {
        const typeName = a.type.name || a.type.ofType?.name || (a.type.ofType?.ofType ? a.type.ofType.ofType.name : '?');
        console.log('  -', a.name, ':', typeName, '(' + a.type.kind + ')');
    });

    console.log('\n=== Queries disponíveis ===');
    data.__schema.queryType.fields.forEach(f => console.log('  -', f.name));

    process.exit(0);
})();
