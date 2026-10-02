import { processRowFoto } from '../src/utils/processRowFoto';

// processRowFoto é síncrona e não faz mais conversão para base64 — essa etapa foi removida
// (payload pesado causava timeout de 120s em redes lentas; fotos pendentes vão via
// uploadPendingPhotos, multipart). Estes testes cobrem as 4 prioridades documentadas
// em src/utils/processRowFoto.ts para os campos `foto` e `foto_questionario`.

describe('processRowFoto — campo foto', () => {
    it('URI local (file://) sem foto_servidor confirmada → vira null (upload é separado)', () => {
        const row = { foto: 'file:///tmp/guia.jpg', foto_servidor: null, num_guia: '001' };
        processRowFoto(row);
        expect(row.foto).toBeNull();
    });

    it('URI local (content://) sem foto_servidor confirmada → vira null', () => {
        const row = { foto: 'content://com.android.providers.media/1234', foto_servidor: null, num_guia: '007' };
        processRowFoto(row);
        expect(row.foto).toBeNull();
    });

    it('URI local com foto_servidor já confirmada → substitui pelo caminho do servidor', () => {
        const row = { foto: 'file:///tmp/guia.jpg', foto_servidor: 'merenda/2026/04/guia.webp', num_guia: '002' };
        processRowFoto(row);
        expect(row.foto).toBe('merenda/2026/04/guia.webp');
    });

    it('já é caminho de servidor (não começa com file:// nem content://) → não mexe', () => {
        const row = { foto: 'merenda/2026/04/guia.webp', foto_servidor: null, num_guia: '003' };
        processRowFoto(row);
        expect(row.foto).toBe('merenda/2026/04/guia.webp');
    });

    it('foto null e sem foto_servidor → permanece null', () => {
        const row = { foto: null, foto_servidor: null, num_guia: '004' };
        processRowFoto(row);
        expect(row.foto).toBeNull();
    });

    it('foto undefined → não lança e não seta nada', () => {
        const row = { foto: undefined, foto_servidor: null, num_guia: '005' };
        expect(() => processRowFoto(row)).not.toThrow();
        expect(row.foto).toBeUndefined();
    });

    it('foto vazia mas foto_servidor já tem caminho → recupera foto_servidor', () => {
        // Caso real: pull do servidor limpou o campo depois que uploadPendingPhotos
        // já tinha confirmado o upload nesta sessão.
        const row = { foto: null, foto_servidor: 'merenda/2026/06/123.webp', num_guia: '006' };
        processRowFoto(row);
        expect(row.foto).toBe('merenda/2026/06/123.webp');
    });
});

describe('processRowFoto — campo foto_questionario (processado independentemente de foto)', () => {
    it('URI local sem confirmação → vira null, mesmo com foto principal já sincronizada', () => {
        const row = {
            foto: 'merenda/2026/04/guia.webp',
            foto_servidor: null,
            foto_questionario: 'file:///tmp/quest.jpg',
            foto_questionario_servidor: null,
            num_guia: '010',
        };
        processRowFoto(row);
        expect(row.foto_questionario).toBeNull();
        expect(row.foto).toBe('merenda/2026/04/guia.webp'); // não afetada
    });

    it('usa foto_questionario_servidor quando já confirmada', () => {
        const row = {
            foto: 'merenda/2026/04/guia.webp',
            foto_servidor: null,
            foto_questionario: 'file:///tmp/quest.jpg',
            foto_questionario_servidor: 'merenda/2026/04/quest.webp',
            num_guia: '012',
        };
        processRowFoto(row);
        expect(row.foto_questionario).toBe('merenda/2026/04/quest.webp');
    });

    it('foto e foto_questionario são processadas de forma independente', () => {
        const row = {
            foto: 'file:///tmp/guia.jpg',
            foto_servidor: 'merenda/2026/04/guia.webp',
            foto_questionario: 'file:///tmp/quest.jpg',
            foto_questionario_servidor: null,
            num_guia: '020',
        };
        processRowFoto(row);
        expect(row.foto).toBe('merenda/2026/04/guia.webp'); // confirmada → substitui
        expect(row.foto_questionario).toBeNull(); // não confirmada → null
    });
});
