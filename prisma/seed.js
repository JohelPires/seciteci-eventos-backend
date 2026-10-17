// Dispatcher do seed: escolhe o arquivo pelo ambiente.
// NODE_ENV=production → seed enxuto (admin + categorias base);
// desenvolvimento (ou outro ambiente) → seed completo de dados de teste.
const seed = process.env.NODE_ENV === 'production' ? require('./seeds/prod') : require('./seeds/dev')
