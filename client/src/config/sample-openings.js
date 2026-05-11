/**
 * Sample Opening Configurations
 * ==============================
 *
 * This file defines the pre-configured opening samples that appear in the
 * "Load Sample" dropdown menu in the GUI.
 *
 * To add a new sample:
 *   1. Copy an existing sample object
 *   2. Give it a unique "id"
 *   3. Set the moves and settings you want
 *   4. Refresh the page - it will appear in the dropdown automatically
 *
 * Any settings you omit will keep their current values in the form.
 */

export const sampleOpenings = {
  samples: [

    // =========================================================================
    // EXAMPLE WITH ALL OPTIONS
    // This first sample shows every configurable option with comments
    // =========================================================================

    {
      // ------ REQUIRED FIELDS ------

      // Unique identifier - used internally, no spaces allowed
      id: "ruy-lopez",

      // Display name shown in the dropdown menu
      name: "Ruy Lopez",

      // Which side you're playing: "white" or "black"
      // Determines which section of the dropdown it appears in
      color: "white",

      // The opening moves in order (Standard Algebraic Notation)
      // These get pasted into the PGN Input field
      moves: ["e4", "e5", "Nf3", "Nc6", "Bb5"],

      // Human-readable move sequence shown in the dropdown
      displayMoves: "1.e4 e5 2.Nf3 Nc6 3.Bb5",

      // Short description explaining the config settings applied
      // Summarizes key settings like: time controls, rating bands, soundness level
      // Examples: "Blitz focused, for 1800s, relaxed soundness"
      //           "All speeds, 2000+ rated, strict engine filters"
      description: "All speeds, higher-rated games, thorough analysis, moderately strict",


      // ------ LICHESS DATABASE TAB ------

      // Time Controls - which game speeds to include data from
      // true = checked, false = unchecked
      timeBullet: true,
      timeBlitz: true,
      timeRapid: true,
      timeClassical: true,
      timeCorrespondence: false,

      // Rating Bands - which player ratings to include data from
      // true = checked, false = unchecked
      rating1600: false,      // Include 1400-1600 rated games
      rating1800: false,      // Include 1600-1800 rated games
      rating2000: true,       // Include 1800-2000 rated games
      rating2200: true,       // Include 2000-2200 rated games
      rating2500: true,       // Include 2200+ rated games


      // ------ OPPONENT FILTERS TAB ------

      // Games Likelihood dropdown: "recent" or "all"
      // "recent" weights recent games more heavily
      gamesLikelihood: "recent",

      // Minimum games for opponent moves
      // Only consider opponent moves played in at least this many games
      opponentMinGames: 50,


      // ------ CANDIDATE MOVES TAB ------

      // Most Played Moves - how many top moves to consider (1-10)
      mostPlayedMoves: 5,

      // Minimum Play Rate % - only consider moves played at least this often
      minPlayratePercent: 1,

      // Candidate Min Games - our moves need at least this many games
      candidateMinGames: 10,

      // Confidence % - statistical confidence threshold
      confidencePercent: 80,

      // Count Draws as Half Point - affects win rate calculation
      // true = draws count as 0.5, false = draws count as 0
      drawsHalfPoint: true,


      // ------ ENGINE FILTERS TAB ------

      // Engine On/Off - whether to use engine analysis
      engineEnabled: true,

      // Engine Depth - search depth in half-moves (10-40)
      // Higher = more accurate but slower
      engineDepth: 18,

      // Engine Finishing - use engine when database runs out
      engineFinishing: true,

      // Soundness Limit (centipawns) - absolute eval floor we'll accept (our POV)
      // -99 means we accept positions down to about 1 pawn worse
      soundnessLimit: -99,

      // Move Loss Limit (centipawns) - max signed drop vs engine best
      // -50 means we won't play a move that loses more than 0.5 pawns vs engine pick
      moveLossLimit: -50,

      // Ignore Loss Limit - if we're ahead by this much, ignore move loss
      ignoreLossLimit: 300,

      // Engine Hash - RAM for engine in MB (16-10240)
      engineHash: 320
    },


    // =========================================================================
    // SIMPLER EXAMPLES
    // These only set the most important options
    // =========================================================================

    {
      id: "italian",
      name: "Italian Game",
      color: "white",
      moves: ["e4", "e5", "Nf3", "Nc6", "Bc4"],
      displayMoves: "1.e4 e5 2.Nf3 Nc6 3.Bc4",

      description: "Balanced defaults, good starting point",
      engineDepth: 16,
      opponentMinGames: 30
    },

    {
      id: "london",
      name: "London System",
      color: "white",
      moves: ["d4", "d5", "Bf4"],
      displayMoves: "1.d4 d5 2.Bf4",

      description: "Forgiving filters, lighter analysis, quick to build",
      engineDepth: 14,
      opponentMinGames: 20,
      // London is solid, so we can be less strict about engine settings
      engineEnabled: true,
      soundnessLimit: -300,
      moveLossLimit: -100
    },

    {
      id: "qgd",
      name: "Queen's Gambit Declined",
      color: "black",
      moves: ["d4", "d5", "c4", "e6"],
      displayMoves: "1.d4 d5 2.c4 e6",

      description: "Standard depth, moderate sample requirements",
      engineDepth: 16,
      opponentMinGames: 40
    },

    {
      id: "sicilian",
      name: "Sicilian Defense",
      color: "black",
      moves: ["e4", "c5"],
      displayMoves: "1.e4 c5",

      description: "Strict and thorough: top players only, tight limits, main lines focus",
      // Sicilian is sharp - use strict settings
      engineDepth: 20,
      opponentMinGames: 100,
      rating1600: false,
      rating1800: false,
      rating2000: true,
      rating2200: true,
      rating2500: true,
      soundnessLimit: -50,     // Strict eval floor
      moveLossLimit: -30,      // Be strict about not losing eval
      mostPlayedMoves: 3       // Focus on main lines only
    },

    {
      id: "caro-kann",
      name: "Caro-Kann Defense",
      color: "black",
      moves: ["e4", "c6"],
      displayMoves: "1.e4 c6",

      description: "Balanced defaults, good starting point",
      engineDepth: 15,
      opponentMinGames: 30
    }

  ]
};
