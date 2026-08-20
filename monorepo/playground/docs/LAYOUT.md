# Arquitetura de Shell e Layout Responsivo (BeerCSS v5)

## Estrutura do App Shell

Para preservar as barras de navegação nativas em dispositivos móveis e desktops sem CSS inline, o app shell deve seguir rigorosamente a hierarquia abaixo:

```tsx
<>
  <nav className="left m l">   {/* Visível apenas em Telas Médias e Grandes */}
  <nav className="bottom s">  {/* Visível apenas em Telas Pequenas (Mobile) */}
  <main className="responsive max no-space">
    <div className="grid no-space max">
      {/* Componentes de Visualização */}
    </div>
  </main>
</>