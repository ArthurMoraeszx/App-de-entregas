module.exports = function (api) {
    api.cache(true);

    const isProduction = process.env.NODE_ENV === 'production';

    return {
        presets: ['babel-preset-expo'],
        plugins: [
            // Os models do WatermelonDB usam decorators (@field, @text, @date).
            ['@babel/plugin-proposal-decorators', { legacy: true }],

            // Precisa vir logo depois dos decorators, e explicitamente.
            //
            // Os campos dos models são declarados como `@text('nome') nome!: string`
            // — decorados e com o `!` de "definitely assigned" do TypeScript. O
            // transform de decorators reescreve esse campo colocando um valor nele;
            // o transform de TypeScript que roda em seguida vê um campo com `!` E
            // com valor, e aborta com "Definitely assigned fields cannot be
            // initialized here, but only in the constructor" — derrubando o bundle
            // inteiro logo no primeiro model.
            //
            // Declarar class-properties aqui, em loose, faz os campos decorados
            // serem consumidos antes de chegarem nessa verificação.
            ['@babel/plugin-transform-class-properties', { loose: true }],

            // Remove todos os console.* apenas no build de produção
            ...(isProduction ? [['transform-remove-console', { exclude: ['error', 'warn'] }]] : []),
        ],
    };
};
