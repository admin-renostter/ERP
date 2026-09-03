const s = require('../infra/signature');

(async () => {
    const enums = ['DeliveryMethodEnum', 'ActionEnum'];
    for (const name of enums) {
        const q = `{ __type(name: "${name}") { enumValues { name } } }`;
        const d = await s.graphql(q);
        console.log(`=== ${name} ===`);
        if (d.__type) d.__type.enumValues.forEach(v => console.log('  -', v.name));
    }
    process.exit(0);
})();
