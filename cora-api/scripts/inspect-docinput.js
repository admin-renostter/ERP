const s = require('../infra/signature');

(async () => {
    const query = `{
        __type(name: "DocumentInput") {
            name
            kind
            inputFields { name type { kind name ofType { kind name ofType { kind name } } } }
        }
    }`;

    const data = await s.graphql(query);
    console.log('=== DocumentInput ===');
    if (data.__type) {
        data.__type.inputFields.forEach(f => {
            const t = f.type;
            const name = t.name || t.ofType?.name || (t.ofType?.ofType ? t.ofType.ofType.name : '?');
            console.log('  -', f.name, ':', name);
        });
    } else {
        console.log('Tipo não encontrado');
    }

    const query2 = `{
        __type(name: "SignerInput") {
            inputFields { name type { name ofType { name } } }
        }
    }`;
    const data2 = await s.graphql(query2);
    console.log('\n=== SignerInput ===');
    if (data2.__type) {
        data2.__type.inputFields.forEach(f => {
            const t = f.type;
            const name = t.name || t.ofType?.name || (t.ofType?.ofType ? t.ofType.ofType.name : '?');
            console.log('  -', f.name, ':', name);
        });
    }

    const query3 = `{
        __type(name: "Document") {
            fields { name type { name ofType { name } } }
        }
    }`;
    const data3 = await s.graphql(query3);
    console.log('\n=== Document (retorno) ===');
    if (data3.__type) {
        data3.__type.fields.forEach(f => {
            const t = f.type;
            const name = t.name || t.ofType?.name || (t.ofType?.ofType ? t.ofType.ofType.name : '?');
            console.log('  -', f.name, ':', name);
        });
    }

    process.exit(0);
})();
