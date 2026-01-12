/**
 * Babel configuration for MCP server tests
 * Enables ES modules transformation for Jest
 */
module.exports = {
    presets: [
        ['@babel/preset-env', { targets: { node: 'current' } }]
    ]
};
