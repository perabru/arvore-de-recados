# Árvore de Recados 🎄

Uma árvore de Natal interativa feita em **HTML, CSS e JavaScript**, sem etapa de compilação. Cada recado vira um enfeite que pode ser aberto, lido e retirado pelo próprio autor.

## Estado da integração

**Publicado inicialmente em modo local.** Os recados são salvos apenas no navegador que os criou; não são compartilhados com outras pessoas ou dispositivos. A interface informa isso permanentemente, inclusive na confirmação de envio. Não há mensagens fictícias.

O acesso à conta Firebase ainda não está conectado. Portanto, nenhum projeto foi escolhido e nenhum banco ou regra existente foi alterado. A ativação deve usar o projeto mais antigo da conta, determinado por sua data de criação, **excluindo o PsiCurando**. Não deduzir idade pela ordem alfabética ou por atividade recente.

## Recursos

- Árvore vetorial com luzes e até 54 enfeites interativos.
- Nome, destinatário opcional, mensagem de até 300 caracteres e quatro cores.
- Lista pesquisável dos até 250 recados mais recentes.
- Leitura em janela acessível e exclusão do próprio recado.
- Persistência local e atualização entre abas no mesmo navegador, no modo local.
- Adaptador Firebase com Authentication anônimo e suporte a Realtime Database ou Firestore, conforme o banco já existente.
- No modo Firebase, sincronização em tempo real e confirmação de envio após o servidor aceitar a gravação. Erros nunca mudam silenciosamente para armazenamento local.
- Compartilhamento do endereço da árvore, layout responsivo e respeito à preferência de movimento reduzido.

## Executar

Sirva a pasta `docs` por HTTP, por exemplo:

```sh
python3 -m http.server 8080 --directory docs
```

Abra o endereço local fornecido pelo servidor. Para verificar validação e persistência:

```sh
npm test
```

## Ativar o Firebase no projeto correto

1. Com acesso autorizado à conta, liste os projetos e compare suas datas de criação. Exclua o PsiCurando e selecione o mais antigo entre os restantes. Registre o ID e a data verificada antes de alterar a configuração.
2. Identifique o banco já existente. Não substitua suas regras nem dados. Use apenas o namespace próprio da árvore.
3. Antes de ativar Authentication anônimo, inspecione as regras já existentes: permissões gerais como `auth != null` podem conceder acesso a outros dados aos novos visitantes anônimos. Não ativar se isso expuser dados de outros apps.
4. Crie ou reutilize um app Web apropriado nesse projeto e copie somente a configuração pública em `docs/firebase-config.js`. Chaves de serviço, tokens e credenciais administrativas nunca pertencem ao site ou ao repositório.
5. Preencha `firebaseConfig`, defina `databaseType` como `rtdb` ou `firestore` e mantenha `treeId = 'public_2026'`. Para RTDB, inclua `databaseURL`.
6. Mescle **somente** o fragmento correspondente de `firebase/` no conjunto existente. No RTDB o arquivo contém a subárvore a inserir dentro de `rules`; no Firestore o bloco entra em `match /databases/{database}/documents`. Esses fragmentos não são arquivos completos para implantação. Verifique concessões amplas nos pais ou regras sobrepostas, que podem prevalecer sobre restrições específicas.
7. Verifique em um teste real: leitura em dois navegadores, gravação e recarga; rejeição de campos inválidos, edição e exclusão por outro usuário; confirmação de que os dados dos outros apps continuam protegidos.
8. Publique a configuração e valide a árvore no GitHub Pages. Os recados criados em modo local não são migrados automaticamente para o mural público.

Namespaces isolados:

| Banco | Caminho |
| --- | --- |
| Realtime Database | `christmasTrees/public_2026/notes` |
| Firestore | `christmas_trees/public_2026/notes` |

Registros usam `uid`, `name`, `recipient`, `message`, `color` e `createdAt` gerado pelo servidor. A exclusão anônima depende da identidade preservada naquele navegador; limpar dados do site perde essa associação. Não há autenticação administrativa ou painel de moderação nesta versão. Para ampla divulgação pública, revisar controles de abuso e quotas do projeto.

## GitHub Pages

Em **Settings → Pages**, selecionar **Deploy from a branch**, branch **main** e pasta **/docs**. Nenhum segredo ou processo de build é necessário para servir a página.

Documentação oficial usada: [SDK Web](https://firebase.google.com/docs/web/alt-setup), [Authentication anônimo](https://firebase.google.com/docs/auth/web/anonymous-auth), [regras RTDB](https://firebase.google.com/docs/database/security), [regras Firestore](https://firebase.google.com/docs/firestore/security/rules-conditions).
