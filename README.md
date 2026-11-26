# Escala do Louvor

O diretório `docs` contém a interface responsiva. O diretório `server` contém a API de autenticação e o banco SQLite. Os dados de exemplo são fictícios.

## Experimentar a interface

Com Python 3.10 ou posterior, rode `python -m http.server 8000 --directory docs` na pasta do projeto e abra http://localhost:8000. Selecione o modo administrador ou integrante. Os dados de demonstração são guardados no navegador atual.

## Rodar o sistema com contas e dados compartilhados

Na pasta do projeto, execute em Linux ou macOS:

```sh
LOUVOR_INITIAL_PASSWORD='SUA-SENHA-TEMPORARIA' python server/app.py
```

No PowerShell:

```powershell
$env:LOUVOR_INITIAL_PASSWORD = 'SUA-SENHA-TEMPORARIA'
python server/app.py
```

Abra http://localhost:8765, escolha **Login líder**, entre como `admin` e troque a senha temporária. Faça a troca inicial em acesso privado, antes de expor a API. O servidor usa a variável somente ao criar o administrador no banco. Também é possível definir uma senha inicial exclusiva com no mínimo oito caracteres.

Crie as contas com e-mail e senha temporária no painel. Entregue a senha diretamente ao titular. A troca é exigida no primeiro acesso. O administrador pode redefinir senhas esquecidas. O pacote usa entrega manual da senha inicial e da redefinição.

## Publicar no GitHub Pages

Extraia o ZIP e envie o conteúdo extraído para a raiz de um novo repositório. No GitHub, abra **Settings → Pages**, selecione **Deploy from a branch**, escolha a branch **main** e a pasta **/docs** e salve. Para testar o modo demonstração, deixe a URL da API vazia.

Para operar com contas reais e dados compartilhados:

1. Hospede a API em servidor com armazenamento persistente. Use HTTPS em um proxy reverso na frente do processo Python e execute o processo sob um serviço supervisionado. Configure `LOUVOR_DB` com o caminho para o SQLite em diretório gravável e mantenha backups.
2. Defina `LOUVOR_ORIGIN` na API com a origem do GitHub Pages, por exemplo `https://usuario.github.io`, sem o caminho do repositório. O backend escuta em `127.0.0.1` na porta 8765 por padrão. Ajuste `LOUVOR_HOST` e `PORT` de acordo com o ambiente.
3. Em `docs/config.js`, indique a URL HTTPS da API, sem barra final. Publique a pasta `/docs` no GitHub Pages. Mantenha o banco SQLite e as credenciais fora do repositório.
4. Entre pelo endereço publicado, crie um integrante e confira a disponibilidade em dois navegadores para validar a conexão compartilhada.

## Operação

- O integrante confirma disponibilidade mês a mês, inclusive se não puder em nenhum domingo.
- O líder configura vagas por instrumento e voz, com opção de formação específica por data.
- A geração trata um culto por domingo, tenta preencher o máximo de vagas por dia e prioriza integrantes com menos participações nas datas anteriores daquela geração.
- Na revisão, cada vaga oferece integrantes qualificados e disponíveis. Violão pode ser acumulado manualmente por um cantor habilitado. Talkback é reservado a um músico habilitado que esteja escalado somente no instrumento.
- Em Escalas publicadas, use o PDF de um domingo ou escolha um período e exporte em PDF ou Excel.

- Para excluir, use **Gerenciar escalas**. Escalas publicadas podem ser selecionadas e excluídas em lote após confirmação.

- Em **Repertório**, escolha o domingo, cole o link da playlist do Spotify e salve. Use uma playlist acessível aos integrantes. A prévia e o link aparecem na escala publicada.

- Para compartilhar cifras, escolha o domingo em **Repertório**, cole o link da pasta ou arquivo e clique em **Salvar cifras**. O material fica visível junto à escala publicada.

- Em **Repertório**, escolha o domingo e, em **Paleta de roupas**, envie uma imagem JPG, PNG ou WebP. Os integrantes a visualizam no cartão da escala publicada.

- Marque **Pode ser dirigente** no cadastro, atribua **Dirigente** no rascunho e publique. O dirigente poderá editar a playlist pelo cartão daquele domingo.
