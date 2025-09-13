/**
* @NApiVersion 2.1
* @NScriptType Suitelet
*/
define(['N/llm', 'N/query', 'N/runtime', 'N/file', 'N/https', 'N/log', 'N/search', 'N/record'],
    function callbackFunction(llm, query, runtime, file, https, log, search, record) {
        // Read preamble from a file in the File Cabinet
        function loadPreamblefromFile() {
            let preamble = '';
            try {
                const script = runtime.getCurrentScript();
                const preambleFileId = script.getParameter({ name: 'custscript_chatbot_preamble_file_id' });
                if (preambleFileId) {
                    const preambleFile = file.load({ id: preambleFileId });
                    preamble = preambleFile.getContents();
                } else {
                    log.error({
                        title: 'Preamble File ID Not Set',
                        details: 'Script parameter "custscript_chatbot_preamble_file_id" is not defined.'
                    });
                }
            } catch (e) {
                log.error({
                    title: 'Error loading preamble file',
                    details: e.message
                });
                preamble = '';
            }
            return preamble;
        }

        function getFunction(context) {
            var contentRequest = https.get({
                //url: "https://tstdrv1254814.app.netsuite.com/core/media/media.nl?id=7813&c=TSTDRV1254814&h=XJPZ2fNl-F4K9CyOk2CV0-42lpXFhV-SiYdSGGrrWhHbdeCj&_xt=.html"
                url: "https://tstdrv1254814.app.netsuite.com/core/media/media.nl?id=8814&c=TSTDRV1254814&h=0mx2dZe7JpoPqqc7v3mNpYmhAOrgBiPFFWPqeNXPE88t46Ik&_xt=.html"
            });
            var contentDocument = contentRequest.body;
            // Get the history file 
            const script = runtime.getCurrentScript();
            const chatHistoryFileId = script.getParameter({ name: 'custscript_chat_history_file_id_ln' });
            const chatHistoryFile = file.load({
                id: chatHistoryFileId
            });

            let messages = chatHistoryFile.getContents();
            messages = JSON.parse(messages);
            let numChats = messages.length;
            context.request.parameters.numChats = numChats; // Pass numChats to the request parameters
            log.debug("numChats", numChats);
            contentDocument.numChats = numChats;

            contentDocument = contentDocument.replace("{{messages}}", JSON.stringify(messages));
            contentDocument = contentDocument.replace("{{numChats}}", numChats);
            //log.debug("#@contentDocument", JSON.stringify(contentDocument));

            context.response.write(contentDocument);

            // // Append "newchat" to the chat history file
            // messages.push("{newchat: true}");
            // file.create({
            //     name: chatHistoryFile.name,
            //     fileType: chatHistoryFile.fileType,
            //     contents: JSON.stringify(messages),
            //     folder: chatHistoryFile.folder
            // }).save();
        }

        function handleDirectPurchaseOrderReceive(context, user_input, current_chatId, poNumber) {
            try {
                log.debug('Attempting to receive PO', { 
                    poNumber: poNumber,
                    userInput: user_input,
                    chatId: current_chatId 
                });

                // First, find the PO by transaction ID (document number)
                const findPOQuery = `
                    SELECT t.id as po_id, 
                           t.tranid as po_number, 
                           e.entityid as vendor_name, 
                           t.trandate as po_date, 
                           t.status as po_status
                    FROM transaction t 
                    JOIN entity e ON t.entity = e.id 
                    WHERE t.type = 'PurchOrd' 
                    AND UPPER(t.tranid) = UPPER('${poNumber}')
                `;

                log.debug('Executing PO search query', { query: findPOQuery });

                const resultSet = query.runSuiteQL({ query: findPOQuery });
                const results = resultSet.asMappedResults();

                log.debug('PO search results', { 
                    resultsCount: results.length,
                    results: results 
                });

                if (results.length === 0) {
                    const notFoundResponse = `❌ Purchase Order ${poNumber} was not found in the system. Please verify the PO number.`;
                    
                    log.debug('PO not found, sending response', { response: notFoundResponse });
                    
                    context.response.write(JSON.stringify({
                        message: [{
                            "user_request": user_input,
                            "final_text_response": notFoundResponse,
                            "timestamp": new Date().toISOString(),
                            "chatId": current_chatId
                        }]
                    }));

                    // Log to history
                    appendToFile({
                        fileIntrnlId: 8815,
                        user_request: user_input,
                        final_text_response: notFoundResponse,
                        timestamp: new Date().toISOString(),
                        chatId: current_chatId
                    });
                    return;
                }

                const poData = results[0];
                const poId = poData.po_id;
                const vendorName = poData.vendor_name;
                const poDate = poData.po_date;
                const poStatus = poData.po_status;

                log.debug('Found PO, attempting receipt creation', { 
                    poId: poId, 
                    poStatus: poStatus,
                    vendorName: vendorName 
                });

                // Load the purchase order record
                const purchaseOrder = record.load({
                    type: record.Type.PURCHASE_ORDER,
                    id: poId
                });

                log.debug('Successfully loaded PO record', { poId: poId });

                // Create item receipt by transforming from PO
                const itemReceipt = record.transform({
                    fromType: record.Type.PURCHASE_ORDER,
                    fromId: poId,
                    toType: record.Type.ITEM_RECEIPT
                });

                log.debug('Successfully created item receipt transformation');

                // Save the item receipt
                const itemReceiptId = itemReceipt.save();
                
                log.debug('Successfully saved item receipt', { itemReceiptId: itemReceiptId });
                
                // Get the created item receipt to retrieve its document number
                const createdItemReceipt = record.load({
                    type: record.Type.ITEM_RECEIPT,
                    id: itemReceiptId
                });
                
                const receiptNumber = createdItemReceipt.getValue({ fieldId: 'tranid' });

                const successResponse = `✅ Success! Purchase Order ${poNumber} from ${vendorName} has been fully received. Item Receipt ${receiptNumber} has been created.`;

                log.audit('PO Received Successfully', {
                    poNumber: poNumber,
                    poId: poId,
                    itemReceiptId: itemReceiptId,
                    receiptNumber: receiptNumber
                });

                context.response.write(JSON.stringify({
                    message: [{
                        "user_request": user_input,
                        "final_text_response": successResponse,
                        "timestamp": new Date().toISOString(),
                        "chatId": current_chatId,
                        "po_received": true,
                        "po_number": poNumber,
                        "po_id": poId,
                        "item_receipt_id": itemReceiptId,
                        "item_receipt_number": receiptNumber
                    }]
                }));

                // Log to history
                appendToFile({
                    fileIntrnlId: 8815,
                    user_request: user_input,
                    final_text_response: successResponse,
                    timestamp: new Date().toISOString(),
                    chatId: current_chatId
                });

            } catch (error) {
                log.error({
                    title: 'Error receiving PO',
                    details: {
                        poNumber: poNumber,
                        error: error.message,
                        stack: error.stack
                    }
                });
                
                const errorResponse = `❌ Error receiving Purchase Order ${poNumber}: ${error.message}. Please check the PO status and permissions.`;
                
                context.response.write(JSON.stringify({
                    message: [{
                        "user_request": user_input,
                        "final_text_response": errorResponse,
                        "timestamp": new Date().toISOString(),
                        "chatId": current_chatId
                    }]
                }));

                // Log error to history
                appendToFile({
                    fileIntrnlId: 8815,
                    user_request: user_input,
                    final_text_response: errorResponse,
                    timestamp: new Date().toISOString(),
                    chatId: current_chatId
                });
            }
        }

        function handleDirectPurchaseOrderApprove(context, user_input, current_chatId, poNumber) {
            try {
                log.debug('Attempting to approve PO', { 
                    poNumber: poNumber,
                    userInput: user_input,
                    chatId: current_chatId 
                });

                // First, find the PO by transaction ID (document number)
                const findPOQuery = `
                    SELECT t.id as po_id, 
                           t.tranid as po_number, 
                           e.entityid as vendor_name, 
                           t.trandate as po_date, 
                           t.status as po_status
                    FROM transaction t 
                    JOIN entity e ON t.entity = e.id 
                    WHERE t.type = 'PurchOrd' 
                    AND UPPER(t.tranid) = UPPER('${poNumber}')
                `;

                log.debug('Executing PO search query for approval', { query: findPOQuery });

                const resultSet = query.runSuiteQL({ query: findPOQuery });
                const results = resultSet.asMappedResults();

                log.debug('PO search results for approval', { 
                    resultsCount: results.length,
                    results: results 
                });

                if (results.length === 0) {
                    const notFoundResponse = `❌ Purchase Order ${poNumber} was not found in the system. Please verify the PO number.`;
                    
                    log.debug('PO not found for approval, sending response', { response: notFoundResponse });
                    
                    context.response.write(JSON.stringify({
                        message: [{
                            "user_request": user_input,
                            "final_text_response": notFoundResponse,
                            "timestamp": new Date().toISOString(),
                            "chatId": current_chatId
                        }]
                    }));

                    // Log to history
                    appendToFile({
                        fileIntrnlId: 8815,
                        user_request: user_input,
                        final_text_response: notFoundResponse,
                        timestamp: new Date().toISOString(),
                        chatId: current_chatId
                    });
                    return;
                }

                const poData = results[0];
                const poId = poData.po_id;
                const vendorName = poData.vendor_name;
                const poDate = poData.po_date;
                const poStatus = poData.po_status;

                log.debug('Found PO for approval, checking status', { 
                    poId: poId, 
                    poStatus: poStatus,
                    vendorName: vendorName 
                });

                // Check if PO is already approved
                if (poStatus === 'B' || poStatus === 'Approved') {
                    const alreadyApprovedResponse = `⚠️ Purchase Order ${poNumber} from ${vendorName} is already approved (Status: ${poStatus}).`;
                    
                    context.response.write(JSON.stringify({
                        message: [{
                            "user_request": user_input,
                            "final_text_response": alreadyApprovedResponse,
                            "timestamp": new Date().toISOString(),
                            "chatId": current_chatId
                        }]
                    }));

                    // Log to history
                    appendToFile({
                        fileIntrnlId: 8815,
                        user_request: user_input,
                        final_text_response: alreadyApprovedResponse,
                        timestamp: new Date().toISOString(),
                        chatId: current_chatId
                    });
                    return;
                }

                // Load the purchase order record
                const purchaseOrder = record.load({
                    type: record.Type.PURCHASE_ORDER,
                    id: poId
                });

                log.debug('Successfully loaded PO record for approval', { poId: poId });

                // Set the approval status - this sets the PO to approved status
                purchaseOrder.setValue({
                    fieldId: 'approvalstatus',
                    value: '2' // 2 = Approved in NetSuite
                });

                log.debug('Set approval status to approved');

                // Save the purchase order with approval
                const savedPoId = purchaseOrder.save();
                
                log.debug('Successfully approved and saved PO', { savedPoId: savedPoId });

                const successResponse = `✅ Success! Purchase Order ${poNumber} from ${vendorName} has been approved and is now ready for processing.`;

                log.audit('PO Approved Successfully', {
                    poNumber: poNumber,
                    poId: poId,
                    previousStatus: poStatus,
                    newStatus: 'Approved'
                });

                context.response.write(JSON.stringify({
                    message: [{
                        "user_request": user_input,
                        "final_text_response": successResponse,
                        "timestamp": new Date().toISOString(),
                        "chatId": current_chatId,
                        "po_approved": true,
                        "po_number": poNumber,
                        "po_id": poId,
                        "previous_status": poStatus
                    }]
                }));

                // Log to history
                appendToFile({
                    fileIntrnlId: 8815,
                    user_request: user_input,
                    final_text_response: successResponse,
                    timestamp: new Date().toISOString(),
                    chatId: current_chatId
                });

            } catch (error) {
                log.error({
                    title: 'Error approving PO',
                    details: {
                        poNumber: poNumber,
                        error: error.message,
                        stack: error.stack
                    }
                });
                
                const errorResponse = `❌ Error approving Purchase Order ${poNumber}: ${error.message}. Please check the PO status and approval permissions.`;
                
                context.response.write(JSON.stringify({
                    message: [{
                        "user_request": user_input,
                        "final_text_response": errorResponse,
                        "timestamp": new Date().toISOString(),
                        "chatId": current_chatId
                    }]
                }));

                // Log error to history
                appendToFile({
                    fileIntrnlId: 8815,
                    user_request: user_input,
                    final_text_response: errorResponse,
                    timestamp: new Date().toISOString(),
                    chatId: current_chatId
                });
            }
        }

        function handleGenericTransactionApprove(context, user_input, current_chatId, transactionType, transactionNumber) {
            try {
                log.debug('Attempting to approve transaction', { 
                    transactionType: transactionType,
                    transactionNumber: transactionNumber,
                    userInput: user_input,
                    chatId: current_chatId 
                });

                // Define transaction type mappings
                const transactionConfig = {
                    'po': {
                        type: 'PurchOrd',
                        recordType: record.Type.PURCHASE_ORDER,
                        displayName: 'Purchase Order',
                        entityField: 'vendor'
                    },
                    'purchase order': {
                        type: 'PurchOrd',
                        recordType: record.Type.PURCHASE_ORDER,
                        displayName: 'Purchase Order',
                        entityField: 'vendor'
                    },
                    'bill': {
                        type: 'VendBill',
                        recordType: record.Type.VENDOR_BILL,
                        displayName: 'Vendor Bill',
                        entityField: 'vendor'
                    },
                    'vendor bill': {
                        type: 'VendBill',
                        recordType: record.Type.VENDOR_BILL,
                        displayName: 'Vendor Bill',
                        entityField: 'vendor'
                    },
                    'journal': {
                        type: 'Journal',
                        recordType: record.Type.JOURNAL_ENTRY,
                        displayName: 'Journal Entry',
                        entityField: null
                    },
                    'journal entry': {
                        type: 'Journal',
                        recordType: record.Type.JOURNAL_ENTRY,
                        displayName: 'Journal Entry',
                        entityField: null
                    }
                };

                const config = transactionConfig[transactionType.toLowerCase()];
                if (!config) {
                    const unsupportedResponse = `❌ Transaction type "${transactionType}" is not supported for approval. Supported types: Purchase Order, Vendor Bill, Journal Entry.`;
                    
                    context.response.write(JSON.stringify({
                        message: [{
                            "user_request": user_input,
                            "final_text_response": unsupportedResponse,
                            "timestamp": new Date().toISOString(),
                            "chatId": current_chatId
                        }]
                    }));

                    appendToFile({
                        fileIntrnlId: 8815,
                        user_request: user_input,
                        final_text_response: unsupportedResponse,
                        timestamp: new Date().toISOString(),
                        chatId: current_chatId
                    });
                    return;
                }

                // Build query based on transaction type
                let findTransactionQuery;
                if (config.entityField) {
                    findTransactionQuery = `
                        SELECT t.id as transaction_id, 
                               t.tranid as transaction_number, 
                               e.entityid as entity_name, 
                               t.trandate as transaction_date, 
                               t.status as transaction_status
                        FROM transaction t 
                        JOIN entity e ON t.${config.entityField} = e.id 
                        WHERE t.type = '${config.type}' 
                        AND UPPER(t.tranid) = UPPER('${transactionNumber}')
                    `;
                } else {
                    // For Journal Entries (no entity)
                    findTransactionQuery = `
                        SELECT t.id as transaction_id, 
                               t.tranid as transaction_number, 
                               '' as entity_name, 
                               t.trandate as transaction_date, 
                               t.status as transaction_status
                        FROM transaction t 
                        WHERE t.type = '${config.type}' 
                        AND UPPER(t.tranid) = UPPER('${transactionNumber}')
                    `;
                }

                log.debug('Executing transaction search query for approval', { query: findTransactionQuery });

                const resultSet = query.runSuiteQL({ query: findTransactionQuery });
                const results = resultSet.asMappedResults();

                log.debug('Transaction search results for approval', { 
                    resultsCount: results.length,
                    results: results 
                });

                if (results.length === 0) {
                    const notFoundResponse = `❌ ${config.displayName} ${transactionNumber} was not found in the system. Please verify the transaction number.`;
                    
                    context.response.write(JSON.stringify({
                        message: [{
                            "user_request": user_input,
                            "final_text_response": notFoundResponse,
                            "timestamp": new Date().toISOString(),
                            "chatId": current_chatId
                        }]
                    }));

                    appendToFile({
                        fileIntrnlId: 8815,
                        user_request: user_input,
                        final_text_response: notFoundResponse,
                        timestamp: new Date().toISOString(),
                        chatId: current_chatId
                    });
                    return;
                }

                const transactionData = results[0];
                const transactionId = transactionData.transaction_id;
                const entityName = transactionData.entity_name;
                const transactionDate = transactionData.transaction_date;
                const transactionStatus = transactionData.transaction_status;

                log.debug('Found transaction for approval, checking status', { 
                    transactionId: transactionId, 
                    transactionStatus: transactionStatus,
                    entityName: entityName 
                });

                // Check if transaction is already approved
                if (transactionStatus === 'B' || transactionStatus === 'Approved') {
                    const entityInfo = entityName ? ` from ${entityName}` : '';
                    const alreadyApprovedResponse = `⚠️ ${config.displayName} ${transactionNumber}${entityInfo} is already approved (Status: ${transactionStatus}).`;
                    
                    context.response.write(JSON.stringify({
                        message: [{
                            "user_request": user_input,
                            "final_text_response": alreadyApprovedResponse,
                            "timestamp": new Date().toISOString(),
                            "chatId": current_chatId
                        }]
                    }));

                    appendToFile({
                        fileIntrnlId: 8815,
                        user_request: user_input,
                        final_text_response: alreadyApprovedResponse,
                        timestamp: new Date().toISOString(),
                        chatId: current_chatId
                    });
                    return;
                }

                // Load the transaction record
                const transactionRecord = record.load({
                    type: config.recordType,
                    id: transactionId
                });

                log.debug('Successfully loaded transaction record for approval', { 
                    transactionId: transactionId,
                    recordType: config.recordType 
                });

                // Set the approval status
                transactionRecord.setValue({
                    fieldId: 'approvalstatus',
                    value: '2' // 2 = Approved in NetSuite
                });

                log.debug('Set approval status to approved');

                // Save the transaction with approval
                const savedTransactionId = transactionRecord.save();
                
                log.debug('Successfully approved and saved transaction', { savedTransactionId: savedTransactionId });

                const entityInfo = entityName ? ` from ${entityName}` : '';
                const successResponse = `✅ Success! ${config.displayName} ${transactionNumber}${entityInfo} has been approved and is now ready for processing.`;

                log.audit('Transaction Approved Successfully', {
                    transactionType: config.displayName,
                    transactionNumber: transactionNumber,
                    transactionId: transactionId,
                    previousStatus: transactionStatus,
                    newStatus: 'Approved'
                });

                context.response.write(JSON.stringify({
                    message: [{
                        "user_request": user_input,
                        "final_text_response": successResponse,
                        "timestamp": new Date().toISOString(),
                        "chatId": current_chatId,
                        "transaction_approved": true,
                        "transaction_type": config.displayName,
                        "transaction_number": transactionNumber,
                        "transaction_id": transactionId,
                        "previous_status": transactionStatus
                    }]
                }));

                // Log to history
                appendToFile({
                    fileIntrnlId: 8815,
                    user_request: user_input,
                    final_text_response: successResponse,
                    timestamp: new Date().toISOString(),
                    chatId: current_chatId
                });

            } catch (error) {
                log.error({
                    title: 'Error approving transaction',
                    details: {
                        transactionType: transactionType,
                        transactionNumber: transactionNumber,
                        error: error.message,
                        stack: error.stack
                    }
                });
                
                const errorResponse = `❌ Error approving ${transactionType} ${transactionNumber}: ${error.message}. Please check the transaction status and approval permissions.`;
                
                context.response.write(JSON.stringify({
                    message: [{
                        "user_request": user_input,
                        "final_text_response": errorResponse,
                        "timestamp": new Date().toISOString(),
                        "chatId": current_chatId
                    }]
                }));

                // Log error to history
                appendToFile({
                    fileIntrnlId: 8815,
                    user_request: user_input,
                    final_text_response: errorResponse,
                    timestamp: new Date().toISOString(),
                    chatId: current_chatId
                });
            }
        }

        function postFunction(context) {
            let preamble = loadPreamblefromFile();
            let resultValue = '';
            log.debug("@@post body", context.request.body);
            log.debug("post parameters", context.request.parameters);

            let user_input = context.request.parameters['user_input'];
            log.debug("user_input", user_input);

            let current_chatId = context.request.parameters['current_chatId'];
            log.debug("current_chatId", current_chatId);

            // Check for direct transaction commands - supports multiple transaction types
            // Receive Patterns: "receive PO555", "receive Purchase Order 555"
            const poReceivePattern = /(receive)\s+(po|purchase\s+order)\s*(\w+)/i;
            
            // Generic Approve Patterns: "approve PO555", "approve Bill123", "approve Journal456"
            const genericApprovePattern = /(approve)\s+(po|purchase\s+order|bill|vendor\s+bill|journal|journal\s+entry)\s*(\w+)/i;
            
            const receiveMatch = user_input.match(poReceivePattern);
            const approveMatch = user_input.match(genericApprovePattern);
            
            if (receiveMatch) {
                const poNumber = receiveMatch[3];
                log.debug("PO Receive Command Detected", { 
                    originalInput: user_input,
                    poNumber: poNumber,
                    matchFound: true 
                });
                return handleDirectPurchaseOrderReceive(context, user_input, current_chatId, poNumber);
            }
            
            if (approveMatch) {
                const transactionType = approveMatch[2];
                const transactionNumber = approveMatch[3];
                log.debug("Generic Approve Command Detected", { 
                    originalInput: user_input,
                    transactionType: transactionType,
                    transactionNumber: transactionNumber,
                    matchFound: true 
                });
                
                // For backward compatibility, still use the specific PO function for PO approvals
                if (transactionType.toLowerCase() === 'po' || transactionType.toLowerCase() === 'purchase order') {
                    return handleDirectPurchaseOrderApprove(context, user_input, current_chatId, transactionNumber);
                } else {
                    return handleGenericTransactionApprove(context, user_input, current_chatId, transactionType, transactionNumber);
                }
            }

            log.debug("No transaction command pattern matched", { user_input: user_input });

            const chatHistory = [];
            // Get the history file
            const script = runtime.getCurrentScript();
            const chatHistoryFileId = script.getParameter({ name: 'custscript_chat_history_file_id_ln' });
            const chatHistoryFile = file.load({ id: chatHistoryFileId });
            let messages = chatHistoryFile.getContents();
            messages = JSON.parse(messages);
            // Filter messages based on the current chatId  
            messages.forEach(message => {
                if (message.chatId === current_chatId) {
                    chatHistory.push({
                        role: llm.ChatRole.USER,
                        text: message.user_request
                    })
                    chatHistory.push({
                        role: llm.ChatRole.CHATBOT,
                        text: message.final_text_response
                    })
                }
            });


            let tableNames = getTableNamesFromPrompt();
            // log.debug('tableNames', tableNames);
            // if (tableNames.length === 0) {
            //     log.error('No table names found');
            //     return;
            // }
            let tableContent = getTableContentFromFileCabinet(tableNames);
            preamble = preamble + tableContent;
            let sql_query = generateSQLQueryFromLLM("");

            try {
                var resultSet = null;
                try {
                    resultSet = query.runSuiteQL({
                        query: sql_query
                    });
                } catch (error) {
                    log.error({
                        title: 'Error executing SuiteQL',
                        details: error.message
                    });
                    sql_query = generateSQLQueryFromLLM(".\nThe above query failed with the error: " + error.message + "\nPlease try again with a different query.");
                    resultSet = query.runSuiteQL({
                        query: sql_query
                    });
                }

                var resultsArray = [];
                resultSet.asMappedResults().forEach(function (row) {
                    resultsArray.push(row);
                });


                if (resultsArray.length > 5) {
                    // Create CSV with headers
                    const headers = resultsArray.length > 0 ? Object.keys(resultsArray[0]).join(',') : '';
                    const dataRows = resultsArray.map(row => Object.values(row).join(','));
                    const csvContent = headers + '\n' + dataRows.join('\n');
                    
                    const csvFile = file.create({
                        name: new Date().toISOString().slice(0, 10) + 'query_results.csv',
                        fileType: file.Type.CSV,
                        contents: csvContent,
                        folder: -15 // Replace with the internal ID of the desired folder in the File Cabinet
                    });
                    const fileId = csvFile.save();
                    log.debug('CSV File Saved', `File ID: ${fileId}`);
                    resultValue = "your results are too long, please check the file";
                    //`The query returned more than 5 rows. <a href="/app/common/media/mediaitem.nl?id=${fileId}" target="_blank">Click here to download the CSV file</a>`;
                    context.response.write(JSON.stringify({
                        message:
                            [{
                                "user_request": user_input,
                                "sql_query": sql_query,
                                "final_text_response": resultValue,
                                "timestamp": new Date().toISOString(),
                                "chatId": current_chatId,
                                "file_name": fileId
                            }]

                    }
                    ));

                    //end
                    var params = {
                        fileIntrnlId: 8815,          // Replace with your file's internal ID
                        user_request: user_input,
                        sql_query: sql_query,
                        final_text_response: resultValue,
                        timestamp: new Date().toISOString(),
                        chatId: current_chatId,
                        file_name: fileId
                    };

                    appendToFile(params);

                } else {
                    resultValue = JSON.stringify(resultsArray, null, 2);
                    let enhanced_respone_prompt = `given this prompt : "${user_input}" the response JSON is : ${resultValue} convert the response 
            to a plain text response that is easy to understand for a user.
            The response should not contain any JSON or code blocks. Do not add any additional information or context.
            The response should be concise and to the point.`;
                    resultValue = llm.generateText({
                        prompt: enhanced_respone_prompt,
                        chatHistory: '',
                    }).text;

                    //start

                    context.response.write(JSON.stringify({
                        message:
                            [{
                                "user_request": user_input,
                                "sql_query": sql_query,
                                "final_text_response": resultValue,
                                "timestamp": new Date().toISOString(),
                                "chatId": current_chatId
                            }]

                    }
                    ));

                    //end
                    var params = {
                        fileIntrnlId: 8815,          // Replace with your file's internal ID
                        user_request: user_input,
                        sql_query: sql_query,
                        final_text_response: resultValue,
                        timestamp: new Date().toISOString(),
                        chatId: current_chatId
                    };

                    appendToFile(params);


                }
            } catch (error) {
                log.error({
                    title: 'Error executing SuiteQL',
                    details: error.message
                });
                resultValue = "Sorry can you rephrase the question? Or Try later?";
                context.response.write(JSON.stringify({
                    message:
                        [{
                            "user_request": user_input,
                            "sql_query": sql_query,
                            "final_text_response": resultValue,
                            "timestamp": new Date().toISOString()
                        }]

                }
                ));
            }

            function extractTableName(input) {
                // Remove code block markers and "json"
                const cleaned = input
                    .replace(/```json\s*/, '')   // remove ```json
                    .replace(/```/, '')          // remove trailing ```
                    .trim();

                try {
                    const parsed = JSON.parse(cleaned);
                    if (Array.isArray(parsed)) {
                        return parsed;
                    } else {
                        throw new Error("Not an array");
                    }
                } catch (err) {
                    return []; // Return an empty array if parsing fails
                }
            }
            //             function generateTableListFromLLM(tablePreamble) {
            //     const generatedText = llm.generateText({
            //         preamble: tablePreamble,
            //         prompt: user_input,
            //         chatHistory: chatHistory,
            //         modelFamily: llm.ModelFamily.COHERE_COMMAND_R_PLUS,
            //         modelParameters: {
            //             temperature: 0.2,
            //         }
            //     }).text;

            //     log.debug('generatedText', generatedText);
            //     let tableNames = extractTableName(generatedText);
            //     log.debug('tableNames', tableNames);
            //     return tableNames;
            // }
            function generateTableListFromLLM(tablePreamble) {
                const openaiApiKey = runtime.getCurrentScript().getParameter({ name: 'custscript_openai_api_key' });

                var payload = {
                    model: "gpt-4o-mini",
                    messages: [
                        { role: "system", content: tablePreamble },
                        { role: "user", content: user_input }
                    ],
                    temperature: 0.2
                };

                var response = https.post({
                    url: "https://api.openai.com/v1/chat/completions",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": "Bearer " + openaiApiKey
                    },
                    body: JSON.stringify(payload)
                });

                var body = JSON.parse(response.body);
                var generatedText = (body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content) || "";
                log.debug('generatedText', generatedText);
                let tableNames = extractTableName(generatedText);
                log.debug('tableNames', tableNames);
                return tableNames;
            }
            // function generateSQLQueryFromLLM(addToUserInput) {
            //     const generatedSQL = llm.generateText({
            //         preamble: preamble,
            //         prompt: user_input + addToUserInput,
            //         chatHistory: chatHistory,
            //         modelFamily: llm.ModelFamily.COHERE_COMMAND_R_PLUS,
            //         modelParameters: {
            //             temperature: 0.2,
            //         }
            //     }).text;

            //     let sql_query = extractSelectStatement(generatedSQL);
            //     log.debug('sql_query', sql_query);
            //     return sql_query;
            // }

            // Alternative: Generate SQL using OpenAI via HTTP call
            function generateSQLQueryFromLLM(addToUserInput) {
                const openaiApiKey = runtime.getCurrentScript().getParameter({ name: 'custscript_openai_api_key' });
            
                var promptText = preamble + "\n" + user_input + addToUserInput;

                var payload = {
                    model: "gpt-4o-mini",
                    messages: [
                        { role: "system", content: preamble },
                        { role: "user", content: user_input + addToUserInput }
                    ],
                    temperature: 0.2
                };

                var response = https.post({
                    url: "https://api.openai.com/v1/chat/completions",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": "Bearer " + openaiApiKey
                    },
                    body: JSON.stringify(payload)
                });

                var body = JSON.parse(response.body);
                var generatedText = (body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content) || "";
                let sql_query = extractSelectStatement(generatedText);
                log.debug('openai_sql_query', sql_query);
                return sql_query;
            }
            /**
* Gets content of multiple files from the File Cabinet based on table names.
* Searches only once using a compound filter for all file names.
* 
* @param {Array} tableList - List of table names (file names without extension).
* @returns {Object} - Map of tableName -> file content or error.
*/
            function getTableContentFromFileCabinet(tableList) {


                var result = ""
                var fileNameMap = {}; // Map file name -> table name for quick reverse lookup
                var filters = [];

                // Create "OR" filters for all filenames
                tableList.forEach(function (tableName, index) {
                    var fileName = tableName + '.txt'; // Adjust extension if needed
                    fileNameMap[fileName] = tableName;

                    if (index === 0) {
                        filters.push(['name', 'is', fileName]);
                    } else {
                        filters.push('or', ['name', 'is', fileName]);
                    }

                });

                // Run a single search across all requested file names
                var fileSearch = search.create({
                    type: 'file',
                    filters: filters,
                    columns: ['name', 'internalid']
                });

                var fileIdMap = {}; // Map file name -> file ID
                fileSearch.run().each(function (resultRow) {
                    var name = resultRow.getValue({ name: 'name' });
                    var id = resultRow.getValue({ name: 'internalid' });
                    fileIdMap[name] = id;
                    return true;
                });

                // Load contents for found files
                Object.keys(fileIdMap).forEach(function (fileName) {
                    var tableName = fileNameMap[fileName];
                    log.debug('getTableContentFromFileCabinet tableName', tableName);
                    try {
                        var loadedFile = file.load({ id: fileIdMap[fileName] });
                        result = result + loadedFile.getContents();
                    } catch (e) {
                       result = 'Error loading file: ' + e.message;
                    }
                });
                
                return result;
            }

            function getTableNamesFromPrompt() {
                //load order2cash_systemprompt_table.txt
                //use the content of the file as preamble
                //pass the prompt to the LLM to get the table names
                let O2Ctable = '';
                try {
                    const script = runtime.getCurrentScript();
                    const O2CTableFileId = script.getParameter({ name: 'custscript_chatbot_o2c_file_id' });
                    if (O2CTableFileId) {
                        const O2CTableFile = file.load({ id: O2CTableFileId });
                        return generateTableListFromLLM(O2CTableFile.getContents());
                    } else {
                        log.error({
                            title: 'O2C File ID Not Set',
                            details: 'Script parameter "custscript_chatbot_o2c_file_id" is not defined.'
                        });
                    }
                } catch (e) {
                    log.error({
                        title: 'Error loading O2C table file',
                        details: e.message
                    });

                }
                return [];

            }

        }

        function appendToFile(params) {
            try {
                // Load the file
                var dataFile = file.load({
                    id: params.fileIntrnlId
                });

                // Get existing content and parse JSON
                var currentContent = dataFile.getContents();
                var jsonArray = currentContent ? JSON.parse(currentContent) : [];

                // Create new entry object
                var newEntry = {
                    user_request: params.user_request,
                    sql_query: params.sql_query,
                    final_text_response: params.final_text_response,
                    timestamp: params.timestamp,
                    chatId: params.chatId,


                };
                if (params.file_name) {
                    newEntry.file_name = params.file_name;
                }

                // Add new entry to array
                jsonArray.push(newEntry);

                // Update file content
                // dataFile.contents = JSON.stringify(jsonArray);
                // var newFileId = dataFile.save();
                var fileObj = file.create({
                    name: dataFile.name,
                    fileType: file.Type.PLAINTEXT,
                    contents: JSON.stringify(jsonArray)
                });
                fileObj.folder = dataFile.folder;
                var newFileId = fileObj.save();

                log.audit({
                    title: 'File Updated',
                    details: 'Appended data to file ID: ' + newFileId
                });

                return newFileId;
            } catch (e) {
                log.error({
                    title: 'Error in appendToFile',
                    details: e.message
                });
                throw e;
            }
        }

        function onRequestFxn(context) {
            // if (context.request.method === "GET") {
            //     getFunction(context)
            // }
            // else {
            //     postFunction(context)
            // }
            if (context.request.method === "GET") {
                let form = getFunction(context);
            }
            else {
                postFunction(context)
            }

        }

        function extractSelectStatement(input) {
            // Remove the ```sql and ``` wrappers if they exist
            return input.replace(/^\s*```sql\s*/i, '').replace(/\s*```$/, '').trim();
        }

        return {
            onRequest: onRequestFxn
        };
    });

