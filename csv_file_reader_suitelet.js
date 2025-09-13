/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/file', 'N/log', 'N/runtime'],
    function(file, log, runtime) {
        
        function onRequest(context) {
            try {
                // Add CORS headers to allow cross-origin requests
                context.response.addHeader({
                    name: 'Access-Control-Allow-Origin',
                    value: '*' // You can restrict this to specific domains for security
                });
                context.response.addHeader({
                    name: 'Access-Control-Allow-Methods',
                    value: 'GET, POST, OPTIONS'
                });
                context.response.addHeader({
                    name: 'Access-Control-Allow-Headers',
                    value: 'Content-Type'
                });
                context.response.addHeader({
                    name: 'Content-Type',
                    value: 'text/plain; charset=utf-8'
                });

                // Handle preflight OPTIONS request
                if (context.request.method === 'OPTIONS') {
                    context.response.write('');
                    return;
                }

                // Get file ID from parameters
                var fileId = context.request.parameters.id || context.request.parameters.fileid;
                
                if (!fileId) {
                    context.response.write('Error: File ID parameter is required. Use ?id=FILE_ID or ?fileid=FILE_ID');
                    return;
                }

                log.debug('CSV File Reader', 'Requested file ID: ' + fileId);

                // Load the file
                var csvFile = file.load({
                    id: fileId
                });

                // Get file contents
                var fileContents = csvFile.getContents();
                
                log.debug('CSV File Reader', 'File loaded successfully. Size: ' + fileContents.length + ' characters');

                // Return the file contents as plain text
                context.response.write(fileContents);

            } catch (error) {
                log.error({
                    title: 'CSV File Reader Error',
                    details: error.message
                });
                
                context.response.write('Error loading file: ' + error.message);
            }
        }

        return {
            onRequest: onRequest
        };
    });
