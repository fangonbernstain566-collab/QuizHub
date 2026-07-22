const express = require('express');

function createApiRouter(db, game) {
  const router = express.Router();

  router.get('/teams', (req, res) => {
    res.json(game.listTeams());
  });

  router.get('/state', (req, res) => {
    res.json(game.getPublicState());
  });

  return router;
}

module.exports = createApiRouter;
