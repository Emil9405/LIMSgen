// src/components/BatchImportModal.js
// Fixed version with Excel date parsing and proper batch creation logic
import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';

const BatchImportModal = ({ isOpen, onClose, onImport, existingReagents, existingBatches }) => {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [importSummary, setImportSummary] = useState(null);
  const fileInputRef = useRef(null);

  // Console logging helper
  const logInfo = (message, data) => {
    console.log(`%c[IMPORT] ${message}`, 'color: #3b82f6; font-weight: bold', data || '');
  };

  const logSuccess = (message, data) => {
    console.log(`%c[✓ IMPORT] ${message}`, 'color: #10b981; font-weight: bold', data || '');
  };

  const logWarning = (message, data) => {
    console.warn(`%c[⚠ IMPORT] ${message}`, 'color: #f59e0b; font-weight: bold', data || '');
  };

  const logError = (message, data) => {
    console.error(`%c[✗ IMPORT] ${message}`, 'color: #ef4444; font-weight: bold', data || '');
  };



  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    console.log('\n' + '='.repeat(60));
    logInfo('🚀 Начало импорта файла');
    logInfo('Имя файла:', selectedFile.name);
    logInfo('Размер файла:', `${(selectedFile.size / 1024).toFixed(2)} KB`);
    logInfo('Тип файла:', selectedFile.type);

    setError('');
    setFile(selectedFile);
    setIsProcessing(true);
    setImportSummary(null);

    try {
      const fileExtension = selectedFile.name.split('.').pop().toLowerCase();
      logInfo('Расширение файла:', fileExtension);
      
      let data = [];

      if (fileExtension === 'json') {
        logInfo('📄 Парсинг JSON файла...');
        data = await parseJSON(selectedFile);
      } else if (fileExtension === 'csv') {
        logInfo('📄 Парсинг CSV файла...');
        data = await parseCSV(selectedFile);
      } else if (['xlsx', 'xls'].includes(fileExtension)) {
        logInfo('📊 Парсинг Excel файла...');
        data = await parseExcel(selectedFile);
      } else {
        throw new Error('Unsupported file format. Use JSON, CSV or Excel (.xlsx, .xls)');
      }

      logSuccess(`Файл успешно распарсен. Найдено строк: ${data.length}`);
      console.log('Первые 3 строки данных:', data.slice(0, 3));

      if (data.length === 0) {
        throw new Error('File contains no data');
      }

      // Process data and check for duplicates
      logInfo('🔄 Обработка данных и проверка дубликатов...');
      const processedData = processImportData(data);
      
      logSuccess(`Данные обработаны. Готово к импорту: ${processedData.length} записей`);
      setPreview(processedData);
      
    } catch (err) {
      logError('Ошибка при обработке файла:', err.message);
      setError(err.message);
      setFile(null);
      setPreview(null);
    } finally {
      setIsProcessing(false);
      console.log('='.repeat(60) + '\n');
    }
  };

  const parseJSON = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          logInfo('Чтение JSON контента...');
          const json = JSON.parse(e.target.result);
          const data = Array.isArray(json) ? json : [json];
          logSuccess(`JSON успешно распарсен: ${data.length} записей`);
          resolve(data);
        } catch (error) {
          logError('Ошибка парсинга JSON:', error.message);
          reject(new Error('JSON parsing error: ' + error.message));
        }
      };
      reader.onerror = () => {
        logError('Ошибка чтения файла');
        reject(new Error('File reading error'));
      };
      reader.readAsText(file);
    });
  };

  const parseCSV = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          logInfo('Чтение CSV контента...');
          const text = e.target.result;
          const lines = text.split('\n').filter(line => line.trim());
          
          if (lines.length === 0) {
            logError('CSV файл пустой');
            reject(new Error('CSV file is empty'));
            return;
          }

          const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
          logInfo('CSV заголовки:', headers);
          
          const data = lines.slice(1).map(line => {
            const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
            const obj = {};
            headers.forEach((header, index) => {
              obj[header] = values[index] || '';
            });
            return obj;
          });

          logSuccess(`CSV успешно распарсен: ${data.length} записей`);
          resolve(data);
        } catch (error) {
          logError('Ошибка парсинга CSV:', error.message);
          reject(new Error('CSV parsing error: ' + error.message));
        }
      };
      reader.onerror = () => {
        logError('Ошибка чтения файла');
        reject(new Error('File reading error'));
      };
      reader.readAsText(file);
    });
  };

  const parseExcel = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          logInfo('Чтение Excel файла...');
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array', cellDates: true });
          
          logInfo('Листы в файле:', workbook.SheetNames);
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          logInfo('Используется лист:', workbook.SheetNames[0]);
          
          const jsonData = XLSX.utils.sheet_to_json(firstSheet);
          
          if (jsonData.length === 0) {
            logError('Excel файл не содержит данных');
            reject(new Error('Excel file contains no data'));
            return;
          }

          logSuccess(`Excel успешно распарсен: ${jsonData.length} записей`);
          logInfo('Колонки в данных:', Object.keys(jsonData[0] || {}));
          resolve(jsonData);
        } catch (error) {
          logError('Ошибка парсинга Excel:', error.message);
          reject(new Error('Excel parsing error: ' + error.message));
        }
      };
      reader.onerror = () => {
        logError('Ошибка чтения файла');
        reject(new Error('File reading error'));
      };
      reader.readAsArrayBuffer(file);
    });
  };

const processImportData = (rawData) => {
    logInfo('Начало обработки импортируемых данных...');
    logInfo('Количество записей для обработки:', rawData.length);
    logInfo('Существующих реагентов в базе:', existingReagents?.length || 0);
    logInfo('Существующих партий в базе:', existingBatches?.length || 0);

    const stats = {
      createNew: 0,
      addBatch: 0,
      updateQuantity: 0
    };

    const processed = rawData.map((row, index) => {
      console.groupCollapsed(`%c📋 Обработка строки ${index + 1}`, 'color: #6366f1');
      
      // Normalize field names
      const normalizedRow = {};
      Object.keys(row).forEach(key => {
        const normalizedKey = key.trim().toLowerCase().replace(/\s+/g, '_');
        normalizedRow[normalizedKey] = row[key];
      });


      logInfo('Исходные данные строки:', row);
      logInfo('Нормализованные ключи:', Object.keys(normalizedRow));

      // Map fields to database structure
      const reagentName = normalizedRow.name || normalizedRow.reagent_name || '';
      const lotNumber = normalizedRow.lot_number || normalizedRow.batch_number || normalizedRow.lotnumber || '';
      
      
      // ВАЖНО: Правильная обработка quantity с валидацией
      // В Excel две колонки - Quantity (кол-во бутылок) и Quantity_1 (объем в мл)
      const quantity1 = parseFloat(normalizedRow.quantity_1);
      const quantity = parseFloat(normalizedRow.quantity);
      
      let quantityValue = 0;
      let quantitySource = '';
      let quantityWarning = null;
      
      if (!isNaN(quantity1) && quantity1 > 0) {
        quantityValue = quantity1;
        quantitySource = 'quantity_1 (объем в мл)';
      } else if (!isNaN(quantity) && quantity > 0) {
        quantityValue = quantity;
        quantitySource = 'quantity (резервное значение)';
        quantityWarning = 'Используется quantity вместо quantity_1 - проверьте единицы измерения';
        logWarning(quantityWarning);
      } else {
        quantityValue = 0;
        quantitySource = 'не указано';
      }
      
      logInfo('Имя реагента:', reagentName);
      logInfo('Номер партии:', lotNumber);
      logInfo('Количество (исходное):', { 
        quantity: normalizedRow.quantity, 
        quantity_1: normalizedRow.quantity_1 
      });
      logInfo('Используемое количество:', quantityValue, 'из:', quantitySource);
      
      // Convert dates properly (handle Excel serial dates)
      const expiryDate = excelDateToISO(normalizedRow.expiry_date || normalizedRow.expiration_date);
      const receivedDate = excelDateToISO(normalizedRow.received_date || normalizedRow.date_received) 
                          || new Date().toISOString();
     // Валидация даты истечения срока
      const expiryValidation = validateExpiryDate(expiryDate);
      if (!expiryValidation.valid) {
        logError(expiryValidation.message);
      }
     logInfo('Срок годности:', expiryDate || 'не указан');
      logInfo('Дата получения:', receivedDate);
    // Валидация CAS номера
      const casNumber = normalizedRow.cas_number || normalizedRow.cas || '';
      const casValidation = validateCASNumber(casNumber);
      if (!casValidation.valid && casNumber) {
        logWarning(`Некорректный формат CAS номера: ${casNumber}`);
      }
      // Валидация единиц измерения
      const unit = normalizedRow.units || normalizedRow.quantity_units || normalizedRow.unit || 'ml';
      const unitValidation = validateUnit(unit);
      if (!unitValidation.valid) {
        logWarning(`Недопустимая единица измерения: ${unit}, будет использована: ml`);
      }
      // Check for existing reagent by name
      const existingReagent = existingReagents?.find(r => 
        r.name.toLowerCase().trim() === reagentName.toLowerCase().trim()
      );
      if (existingReagent) {
        logSuccess(`Найден существующий реагент: ID ${existingReagent.id}`);
      } else {
        logWarning('Реагент не найден - будет создан новый');
      }
        // Check for existing batch by reagent name AND batch number
      const existingBatch = existingBatches?.find(b => {
        const batchReagent = existingReagents?.find(r => r.id === b.reagent_id);
        return batchReagent && 
               batchReagent.name.toLowerCase().trim() === reagentName.toLowerCase().trim() &&
               b.batch_number.toLowerCase().trim() === lotNumber.toLowerCase().trim();
      });
      let action;
      if (existingBatch) {
        action = 'update_quantity';
        logWarning(`Найдена существующая партия: ${existingBatch.batch_number}`);
        logInfo(`Текущее количество: ${existingBatch.quantity}`);
        logInfo(`Добавляется: ${quantityValue}`);
        logInfo(`Новое количество: ${existingBatch.quantity + quantityValue}`);
        stats.updateQuantity++;
      } else if (existingReagent) {
        action = 'add_batch';
        logSuccess('Будет добавлена новая партия к существующему реагенту');
        stats.addBatch++;
      } else {
        action = 'create_new';
        logSuccess('Будет создан новый реагент и партия');
        stats.createNew++;
      }
      const parsedQuantity = quantityValue;
      const isValidQuantity = parsedQuantity > 0;
      // Сбор всех ошибок валидации
      const validationErrors = [];
      
      if (!isValidQuantity) {
        validationErrors.push(`Неверное количество: "${normalizedRow.quantity_1 || normalizedRow.quantity || 'не указано'}"`);
      }
      
      if (!reagentName) {
        validationErrors.push('Не указано имя реагента');
      }
      
      if (!lotNumber) {
        validationErrors.push('Не указан номер партии');
      }
      
      if (!casValidation.valid && casNumber) {
        validationErrors.push(`Некорректный CAS номер: ${casNumber}`);
      }
      
      if (!unitValidation.valid) {
        validationErrors.push(`Недопустимая единица измерения: ${unit}`);
      }
      
      if (!expiryValidation.valid) {
        validationErrors.push(expiryValidation.message);
      }
       const result = {
        rowIndex: index + 1,
        // Reagent data
        reagent: {
          name: reagentName,
          formula: normalizedRow.formula || '',
          cas_number: casValidation.valid ? casNumber : '',
          manufacturer: normalizedRow.manufacturer || '',
          description: normalizedRow.description || ''
        },
        // Batch data
        batch: {
          batch_number: lotNumber,
          cat_number: normalizedRow.cat_number || normalizedRow.catalog_number || '',
          quantity: isValidQuantity ? parsedQuantity : 0,
          unit: unitValidation.valid ? unit : 'ml',
          location: normalizedRow.place || normalizedRow.location || '',
          notes: normalizedRow.notes || '',
          manufacturer: normalizedRow.manufacturer || '',
          supplier: normalizedRow.supplier || '',
          expiry_date: expiryValidation.valid ? expiryDate : null,
          received_date: receivedDate
        },
        // Validation status
        existingReagent: existingReagent || null,
        existingBatch: existingBatch || null,
        existing_batch_id: existingBatch?.id || null,
        action: action,
        newQuantity: existingBatch ? existingBatch.quantity + parsedQuantity : parsedQuantity,
        // Validation flags
        hasValidationErrors: validationErrors.length > 0,
        validationErrors: validationErrors,
        quantityWarning: quantityWarning
      };

      logInfo('Результат обработки:', { 
        action, 
        reagent: result.reagent.name, 
        batch: result.batch.batch_number,
        errors: validationErrors.length 
      });
      console.groupEnd();

      return result;
    });

    logInfo('=== СТАТИСТИКА ОБРАБОТКИ ===');
    logInfo(`Создать новых реагентов: ${stats.createNew}`);
    logInfo(`Добавить партий к существующим: ${stats.addBatch}`);
    logInfo(`Обновить количество: ${stats.updateQuantity}`);
    
    const errorsCount = processed.filter(p => p.hasValidationErrors).length;
    if (errorsCount > 0) {
      logError(`Строк с ошибками валидации: ${errorsCount}`);
    }

    return processed;
  };
  // Функция валидации CAS номера
  const validateCASNumber = (cas) => {
    if (!cas || cas.trim() === '') {
      return { valid: true }; // CAS необязателен
    }
    
    // Формат: XXX-XX-X или XXXXX-XX-X
    const casPattern = /^\d{2,7}-\d{2}-\d$/;
    const isValid = casPattern.test(cas);
    
    return {
      valid: isValid,
      message: isValid ? null : `Некорректный формат CAS: ${cas}. Ожидается формат XXX-XX-X`
    };
  };
  
  // Функция валидации единиц измерения
  const validateUnit = (unit) => {
    const allowedUnits = [
      'mg', 'g', 'kg', 'ml', 'l', 'μl', 'μg', 'ng', 
      'units', 'vials', 'tablets', 'ul', 'ug'
    ];
    
    const normalizedUnit = unit.toLowerCase().replace(/\s+/g, '');
    const isValid = allowedUnits.includes(normalizedUnit);
    
    return {
      valid: isValid,
      message: isValid ? null : `Недопустимая единица: ${unit}`
    };
  };
  
  // Функция валидации даты истечения срока
  const validateExpiryDate = (dateStr) => {
    if (!dateStr) {
      return { valid: true }; // Дата необязательна
    }
    
    try {
      const date = new Date(dateStr);
      const now = new Date();
      
      if (isNaN(date.getTime())) {
        return {
          valid: false,
          message: 'Некорректный формат даты'
        };
      }
      
      if (date < now) {
        return {
          valid: false,
          message: 'Дата истечения срока не может быть в прошлом'
        };
      }
      
      return { valid: true };
    } catch (e) {
      return {
        valid: false,
        message: 'Ошибка при обработке даты'
      };
    }
  };

  // Функция конвертации Excel serial date в ISO
  const excelDateToISO = (value) => {
    if (!value) return null;
    
    // Если уже ISO формат
    if (typeof value === 'string' && value.includes('T')) {
      return value;
    }
    
    // Если строка в формате даты
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      return new Date(value).toISOString();
    }
    
    // Если Excel serial number (число дней с 1900-01-01)
    if (typeof value === 'number' && value > 25569) { // 25569 = 1970-01-01 в Excel
      const excelEpoch = new Date(1899, 11, 30); // Excel epoch
      const date = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
      return date.toISOString();
    }
    
    // Попытка парсинга как обычной даты
    try {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
    } catch (e) {
      console.error('Ошибка конвертации даты:', value, e);
    }
    
    return null;
  };


  const handleImport = async () => {
    if (!preview || preview.length === 0) {
      logError('Нет данных для импорта');
      setError('No data to import');
      return;
    }

    console.log('\n' + '='.repeat(60));
    logInfo('💾 Начало импорта в базу данных');
    logInfo('Количество записей для импорта:', preview.length);

    setIsProcessing(true);
    setError('');

    try {
      const summary = {
        newReagents: 0,
        newBatches: 0,
        updatedBatches: 0,
        errors: []
      };

      logInfo('Отправка данных на сервер...');
      const startTime = performance.now();
      const results = await onImport(preview);
      const endTime = performance.now();
      
      logSuccess(`Сервер ответил за ${((endTime - startTime) / 1000).toFixed(2)} секунд`);
      logInfo('Получено результатов:', results.length);

      console.log('\n' + '─'.repeat(60));
      logInfo('Обработка результатов импорта...');
      
      preview.forEach((item, index) => {
        console.groupCollapsed(`%cРезультат строки ${item.rowIndex}`, 
          results[index]?.success ? 'color: #10b981' : 'color: #ef4444');
        
        logInfo('Данные для импорта:', {
          reagent: item.reagent,
          batch: item.batch,
          action: item.action
        });
        
        if (results[index]?.success) {
          logSuccess(`✓ Успешно: ${item.reagent.name} (${item.batch.batch_number})`);
          logInfo('Действие:', item.action);
          
          if (item.action === 'create_new') {
            summary.newReagents++;
            summary.newBatches++;
            logInfo('Создан новый реагент и партия');
          } else if (item.action === 'add_batch') {
            summary.newBatches++;
            logInfo('Добавлена новая партия');
          } else if (item.action === 'update_quantity') {
            summary.updatedBatches++;
            logInfo(`Обновлено количество: ${item.existingBatch?.quantity} → ${item.newQuantity}`);
          }
        } else {
          logError(`✗ Ошибка: ${item.reagent.name}`);
          logError('Причина:', results[index]?.error || 'Unknown error');
          summary.errors.push({
            row: item.rowIndex,
            name: item.reagent.name,
            error: results[index]?.error || 'Unknown error'
          });
        }
        
        console.groupEnd();
      });

      console.log('\n' + '─'.repeat(60));
      logSuccess('📊 Итоговая статистика импорта:');
      console.table({
        'Новых реагентов': summary.newReagents,
        'Новых партий': summary.newBatches,
        'Обновлено партий': summary.updatedBatches,
        'Успешно': preview.length - summary.errors.length,
        'Ошибок': summary.errors.length
      });

      if (summary.errors.length > 0) {
        console.log('\n');
        logWarning(`⚠ Обнаружено ${summary.errors.length} ошибок:`);
        summary.errors.forEach(err => {
          logError(`  Строка ${err.row}: ${err.name} - ${err.error}`);
        });
      }

      console.log('='.repeat(60) + '\n');

      setImportSummary(summary);
      
      if (summary.errors.length === 0) {
        logSuccess('🎉 Импорт завершен успешно! Закрытие через 3 секунды...');
        setTimeout(() => {
          handleClose();
        }, 3000);
      } else {
        logWarning('Импорт завершен с ошибками. Проверьте детали выше.');
      }
    } catch (err) {
      logError('Критическая ошибка импорта:', err.message);
      console.error('Stack trace:', err);
      setError('Import error: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    logInfo('Закрытие модального окна импорта');
    setFile(null);
    setPreview(null);
    setError('');
    setImportSummary(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>Batch Import</h2>
          <button onClick={handleClose} style={styles.closeButton} disabled={isProcessing}>
            Ã—
          </button>
        </div>

        <div style={styles.body}>
          {/* Instructions */}
          {!file && !importSummary && (
            <div style={styles.instructions}>
              <h3 style={styles.sectionTitle}>Import Instructions</h3>
              <ul style={styles.list}>
                <li>Supported formats: Excel (.xlsx, .xls), CSV, JSON</li>
                <li>Required columns: name, lot_number (or batch_number), quantity</li>
                <li>Optional columns: formula, cas_number, manufacturer, supplier, location, expiry_date, received_date, notes</li>
                <li>Dates will be automatically converted from Excel format</li>
                <li>If reagent exists, a new batch will be added</li>
                <li>If batch exists, quantity will be updated</li>
              </ul>
            </div>
          )}

          {/* File input */}
          {!importSummary && (
            <div style={styles.fileInputSection}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.json"
                onChange={handleFileChange}
                style={styles.fileInput}
                disabled={isProcessing}
              />
            </div>
          )}

          {/* Error message */}
          {error && (
            <div style={styles.errorBox}>
              <strong>Error:</strong> {error}
            </div>
          )}

          {/* Import summary */}
          {importSummary && (
            <div style={styles.summarySection}>
              <h3 style={styles.successTitle}>Import completed!</h3>
              <p>New reagents: <strong>{importSummary.newReagents}</strong></p>
              <p>New batches: <strong>{importSummary.newBatches}</strong></p>
              <p>Updated batches (quantity added): <strong>{importSummary.updatedBatches}</strong></p>
              {importSummary.errors.length > 0 && (
                <div style={styles.errorsList}>
                  <p style={styles.errorsTitle}>Errors ({importSummary.errors.length}):</p>
                  {importSummary.errors.slice(0, 5).map((err, idx) => (
                    <p key={idx} style={styles.errorItem}>
                      Row {err.row}: {err.name} - {err.error}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Data preview */}
          {preview && !importSummary && (
            <div style={styles.previewSection}>
              <h3 style={styles.sectionTitle}>
                Import Preview ({preview.length} records)
              </h3>
              <div style={styles.tableContainer}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>#</th>
                      <th style={styles.th}>Reagent</th>
                      <th style={styles.th}>Lot Number</th>
                      <th style={styles.th}>Quantity</th>
                      <th style={styles.th}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 10).map((item, index) => (
                      <tr key={index} style={item.action === 'update_quantity' ? styles.updateRow : {}}>
                        <td style={styles.td}>{item.rowIndex}</td>
                        <td style={styles.td}>{item.reagent.name}</td>
                        <td style={styles.td}>{item.batch.batch_number}</td>
                        <td style={styles.td}>
                          {item.action === 'update_quantity' ? (
                            <>
                              {item.existingBatch?.quantity} + {item.batch.quantity} = <strong>{item.newQuantity}</strong>
                            </>
                          ) : (
                            item.batch.quantity
                          )}
                          {' '}{item.batch.unit}
                        </td>
                        <td style={styles.td}>
                          {item.action === 'create_new' && <span style={styles.badgeNew}>New reagent + batch</span>}
                          {item.action === 'add_batch' && <span style={styles.badgeAdd}>New batch</span>}
                          {item.action === 'update_quantity' && <span style={styles.badgeUpdate}>Update quantity</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.length > 10 && (
                  <p style={styles.moreRecords}>
                    ... and {preview.length - 10} more records
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <div style={styles.footer}>
          <button
            onClick={handleClose}
            style={styles.cancelButton}
            disabled={isProcessing}
          >
            {importSummary ? 'Close' : 'Cancel'}
          </button>
          {!importSummary && preview && (
            <button
              onClick={handleImport}
              style={styles.importButton}
              disabled={isProcessing}
            >
              {isProcessing ? 'Importing...' : `Import ${preview.length} records`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Styles
const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: '8px',
    width: '90%',
    maxWidth: '900px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
  },
  header: {
    padding: '20px',
    borderBottom: '1px solid #e5e7eb',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    margin: 0,
    fontSize: '24px',
    fontWeight: '600',
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '32px',
    cursor: 'pointer',
    color: '#6b7280',
    lineHeight: 1,
    padding: 0,
    width: '32px',
    height: '32px',
  },
  body: {
    padding: '20px',
    overflowY: 'auto',
    flex: 1,
  },
  instructions: {
    backgroundColor: '#f3f4f6',
    padding: '15px',
    borderRadius: '6px',
    marginBottom: '20px',
  },
  sectionTitle: {
    margin: '0 0 10px 0',
    fontSize: '16px',
    fontWeight: '600',
  },
  list: {
    margin: '10px 0',
    paddingLeft: '20px',
  },
  fileInputSection: {
    marginBottom: '20px',
  },
  fileInput: {
    width: '100%',
    padding: '10px',
    border: '2px dashed #d1d5db',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  errorBox: {
    backgroundColor: '#fee2e2',
    border: '1px solid #fecaca',
    color: '#991b1b',
    padding: '15px',
    borderRadius: '6px',
    marginBottom: '20px',
  },
  summarySection: {
    backgroundColor: '#d1fae5',
    border: '1px solid #a7f3d0',
    padding: '20px',
    borderRadius: '6px',
  },
  successTitle: {
    color: '#065f46',
    marginTop: 0,
  },
  errorsList: {
    marginTop: '15px',
    padding: '10px',
    backgroundColor: '#fee2e2',
    borderRadius: '6px',
  },
  errorsTitle: {
    fontWeight: 'bold',
    color: '#991b1b',
    marginBottom: '10px',
  },
  errorItem: {
    margin: '5px 0',
    color: '#991b1b',
    fontSize: '14px',
  },
  previewSection: {
    marginTop: '20px',
  },
  tableContainer: {
    overflowX: 'auto',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    backgroundColor: '#f9fafb',
    padding: '12px',
    textAlign: 'left',
    fontWeight: '600',
    borderBottom: '2px solid #e5e7eb',
  },
  td: {
    padding: '12px',
    borderBottom: '1px solid #e5e7eb',
  },
  updateRow: {
    backgroundColor: '#fef3c7',
  },
  badgeNew: {
    backgroundColor: '#dbeafe',
    color: '#1e40af',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '600',
  },
  badgeAdd: {
    backgroundColor: '#d1fae5',
    color: '#065f46',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '600',
  },
  badgeUpdate: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '600',
  },
  moreRecords: {
    padding: '15px',
    textAlign: 'center',
    color: '#6b7280',
    fontStyle: 'italic',
  },
  footer: {
    padding: '20px',
    borderTop: '1px solid #e5e7eb',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
  },
  cancelButton: {
    padding: '10px 20px',
    borderRadius: '6px',
    border: '1px solid #d1d5db',
    backgroundColor: 'white',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  },
  importButton: {
    padding: '10px 20px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: '#3b82f6',
    color: 'white',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  },
};

export default BatchImportModal;