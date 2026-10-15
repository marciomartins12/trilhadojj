module.exports = {
  index: (req, res) => {
    res.render('home', {
      pageTitle: 'Trilha do JJ',
      subtitle: 'Aventura, Natureza e Adrenalina',
      description:
        'Prepare-se para um percurso incrível, repleto de desafios e paisagens únicas. A trilha contará com toda a estrutura necessária para garantir conforto e segurança aos participantes.',
      // Métricas da trilha
      distance: '35 km',
      tipo: 'misto',
      tempoMedio: '4h',
     
    });
  },
};