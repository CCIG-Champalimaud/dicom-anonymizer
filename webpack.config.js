// Generated using webpack-cli https://github.com/webpack/webpack-cli

const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');

const isProduction = process.env.NODE_ENV == 'production';


const config = {
    entry: './src/DicomAnonymizer.js',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'dicom-anonymizer.js',
        library: 'DicomAnonymizer',
        libraryTarget: 'umd',
        globalObject: 'this',
    },
    plugins: [
        new HtmlWebpackPlugin({
            hash: true,
            title: 'Dicom Anonymizer',
            myPageHeader: 'Dicom Anonymizer',
            template: './src/index.html',
            filename: 'index.html' 
        }),
        new webpack.ProvidePlugin({
            process: 'process/browser',
        }),
        // Add your plugins here
        // Learn more about plugins from https://webpack.js.org/configuration/plugins/
    ],
    module: {
        rules: [
            {
                test: /\.(eot|svg|ttf|woff|woff2|png|jpg|gif)$/i,
                type: 'asset',
            },

            // Add your rules for custom modules here
            // Learn more about loaders from https://webpack.js.org/loaders/
        ],
    },
    resolve: {
        fallback: {
            "assert": false,
            "constants": false,
            "stream": false,
            "fs-extra": false,
            "fs": false,
            // "path": false
        },
    }
};

module.exports = () => {
    if (isProduction) {
        config.mode = 'production';
        
        
    } else {
        config.mode = 'development';
    }
    return config;
};
