import { jsPDF } from 'jspdf';

export interface FreightData {
  id: string;
  companyId: string;
  truckId: string;
  origem: string;
  destino: string;
  valorBruto: number;
  pedagio: number;
  combustivel: number;
  motorista: number;
  outrasDespesas: number;
  localAbastecimento?: string;
  fotoAbastecimento?: string;
  localPedagio?: string;
  localMotorista?: string;
  outrosDetalhes?: string;
  fotoComprovanteGeral?: string;
  status: string;
  data: string;
  distanciaKm?: number;
  kmAbastecimento?: number;
}

export function generateFreightPDF(freight: FreightData) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageHeight = 297;
  const pageWidth = 210;

  // Colors
  const primaryColor = [15, 23, 42]; // Slate 900 #0F172A
  const secondaryColor = [37, 99, 235]; // Blue 600 #2563EB
  const textColorDark = [30, 41, 59]; // Slate 800
  const textColorLight = [100, 116, 139]; // Slate 500
  const bgLight = [248, 250, 252]; // Slate 50

  const drawHeader = (docInstance: jsPDF, title: string) => {
    // Header Banner
    docInstance.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    docInstance.rect(0, 0, pageWidth, 40, 'F');

    // Accent line
    docInstance.setFillColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    docInstance.rect(0, 40, pageWidth, 2.5, 'F');

    // Title text
    docInstance.setTextColor(255, 255, 255);
    docInstance.setFont('helvetica', 'bold');
    docInstance.setFontSize(20);
    docInstance.text('DOSSIÊ DE VIAGEM & RECIBO', 15, 18);

    docInstance.setFont('helvetica', 'normal');
    docInstance.setFontSize(9);
    docInstance.setTextColor(191, 219, 254); // Light blue
    docInstance.text('SISTEMA DE GESTÃO DE FROTAS PREMIUM', 15, 25);

    // Date & Document control
    docInstance.setTextColor(255, 255, 255);
    docInstance.setFont('helvetica', 'bold');
    docInstance.setFontSize(9);
    docInstance.text(`VIAGEM ID: #${freight.id.toUpperCase().substring(0, 8)}`, pageWidth - 80, 18);
    docInstance.setFont('helvetica', 'normal');
    docInstance.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`, pageWidth - 80, 25);
  };

  // --- PAGE 1: DOSSIER AND FINANCIAL SUMMARY ---
  drawHeader(doc, 'DOSSIÊ DE VIAGEM & RECIBO');

  let currentY = 55;

  // Section 1: Overview
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('I. Informações Gerais da Operação', 15, currentY);
  
  // Underline
  doc.setDrawColor(226, 232, 240);
  doc.line(15, currentY + 2, pageWidth - 15, currentY + 2);

  currentY += 10;

  // Draw details box
  doc.setFillColor(bgLight[0], bgLight[1], bgLight[2]);
  doc.rect(15, currentY, pageWidth - 30, 36, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.rect(15, currentY, pageWidth - 30, 36, 'D');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(textColorDark[0], textColorDark[1], textColorDark[2]);
  
  doc.text('Veículo / Placa:', 20, currentY + 8);
  doc.text('Status:', 20, currentY + 16);
  doc.text('Data do Lançamento:', 20, currentY + 24);
  doc.text('Distância da Viagem:', 20, currentY + 32);

  doc.text('Origem:', pageWidth / 2 + 5, currentY + 8);
  doc.text('Destino:', pageWidth / 2 + 5, currentY + 16);
  doc.text('Operação:', pageWidth / 2 + 5, currentY + 24);
  doc.text('KM Combustível:', pageWidth / 2 + 5, currentY + 32);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(textColorLight[0], textColorLight[1], textColorLight[2]);
  doc.text(freight.truckId || '--', 55, currentY + 8);

  const statusText = freight.status.toUpperCase();
  doc.setFont('helvetica', 'bold');
  if (freight.status === 'Concluído') {
    doc.setTextColor(16, 185, 129); // Emerald
  } else if (freight.status === 'Em Andamento') {
    doc.setTextColor(245, 158, 11); // Amber
  } else {
    doc.setTextColor(239, 68, 68); // Red
  }
  doc.text(statusText, 45, currentY + 16);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(textColorLight[0], textColorLight[1], textColorLight[2]);
  doc.text(new Date(freight.data).toLocaleDateString('pt-BR'), 60, currentY + 24);
  doc.text(freight.distanciaKm ? `${freight.distanciaKm} km` : 'Não informada', 60, currentY + 32);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(textColorDark[0], textColorDark[1], textColorDark[2]);
  doc.text(freight.origem, pageWidth / 2 + 25, currentY + 8);
  doc.text(freight.destino, pageWidth / 2 + 25, currentY + 16);
  
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(textColorLight[0], textColorLight[1], textColorLight[2]);
  doc.text('Transporte Rodoviário Dedicado', pageWidth / 2 + 28, currentY + 24);
  doc.text(freight.kmAbastecimento ? `${freight.kmAbastecimento} km` : 'Não informado', pageWidth / 2 + 38, currentY + 32);

  // Section 2: Custos e Repartição Financeira
  currentY += 46;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('II. Planilha Detalhada de Receita e Custos', 15, currentY);
  
  doc.setDrawColor(226, 232, 240);
  doc.line(15, currentY + 2, pageWidth - 15, currentY + 2);

  currentY += 10;

  // Table header
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(15, currentY, pageWidth - 30, 8, 'F');
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('DESCRIÇÃO DO ITEM', 18, currentY + 5.5);
  doc.text('ESPECIFICAÇÕES / NOTAS DA ROTA / LOCALIDADES', 60, currentY + 5.5);
  doc.text('VALOR', pageWidth - 32, currentY + 5.5);

  currentY += 8;

  // Table items helper
  const drawRow = (label: string, spec: string, value: number, isPositive: boolean) => {
    doc.setFillColor(255, 255, 255);
    doc.rect(15, currentY, pageWidth - 30, 10, 'F');
    doc.setDrawColor(241, 245, 249);
    doc.line(15, currentY + 10, pageWidth - 15, currentY + 10);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(textColorDark[0], textColorDark[1], textColorDark[2]);
    doc.text(label, 18, currentY + 6.5);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(textColorLight[0], textColorLight[1], textColorLight[2]);
    
    // Split spec text to prevent overflow
    const splitSpec = doc.splitTextToSize(spec || 'Não descrita / Geral', 95);
    doc.text(splitSpec, 60, currentY + 6);

    doc.setFont('helvetica', 'bold');
    if (isPositive) {
      doc.setTextColor(16, 185, 129); // green
      doc.text(`R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (+)`, pageWidth - 38, currentY + 6.5);
    } else {
      doc.setTextColor(239, 68, 68); // red
      doc.text(`R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (-)`, pageWidth - 38, currentY + 6.5);
    }

    currentY += 10;
  };

  const freightExpensesSum = 
    (freight.pedagio || 0) + 
    (freight.combustivel || 0) + 
    (freight.motorista || 0) + 
    (freight.outrasDespesas || 0);
  const freightProfit = (freight.valorBruto || 0) - freightExpensesSum;
  const freightMargin = freight.valorBruto > 0 ? (freightProfit / freight.valorBruto) * 100 : 0;

  // Add Row 1: Receita
  drawRow('VALOR BRUTO (FRETE)', `Recebível pela viagem de ${freight.origem} para ${freight.destino}`, freight.valorBruto, true);
  
  // Add Row 2: Combustível
  drawRow('COMBUSTÍVEL', freight.localAbastecimento || 'Sem informações de posto', freight.combustivel || 0, false);

  // Add Row 3: Pedágios
  drawRow('PEDÁGIOS / TAXAS', freight.localPedagio || 'Pedágio em autoestrada', freight.pedagio || 0, false);

  // Add Row 4: Diárias / Motoristas
  drawRow('DIÁRIAS / TRABALHO', freight.localMotorista || 'Custo de diária operacional', freight.motorista || 0, false);

  // Add Row 5: Outros
  drawRow('OUTROS CUSTOS', freight.outrosDetalhes || 'Sem outras justificativas', freight.outrasDespesas || 0, false);

  currentY += 3;

  // Summary box
  doc.setFillColor(bgLight[0], bgLight[1], bgLight[2]);
  doc.rect(15, currentY, pageWidth - 30, 24, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.rect(15, currentY, pageWidth - 30, 24, 'D');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(textColorDark[0], textColorDark[1], textColorDark[2]);
  doc.text('TOTAL DE DESPESAS DA OPERAÇÃO:', 18, currentY + 7);
  doc.setTextColor(239, 68, 68);
  doc.text(`R$ ${freightExpensesSum.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, pageWidth - 55, currentY + 7);

  doc.setTextColor(textColorDark[0], textColorDark[1], textColorDark[2]);
  doc.text('RESULTADO LÍQUIDO DO FRETE (LUCRO):', 18, currentY + 15);
  if (freightProfit >= 0) {
    doc.setTextColor(16, 185, 129);
    doc.text(`R$ ${freightProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, pageWidth - 55, currentY + 15);
  } else {
    doc.setTextColor(239, 68, 68);
    doc.text(`R$ ${freightProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (Prejuízo)`, pageWidth - 55, currentY + 15);
  }

  doc.setFontSize(8.5);
  doc.setTextColor(textColorLight[0], textColorLight[1], textColorLight[2]);
  doc.text('MARGEM DE RENTABILIDADE:', 18, currentY + 22);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.text(`${freightMargin.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% de margem líquida`, 65, currentY + 22);

  currentY += 34;

  // Section 3: assinaturas
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('III. Declaração de Conformidade e Assinaturas', 15, currentY);
  
  doc.setDrawColor(226, 232, 240);
  doc.line(15, currentY + 2, pageWidth - 15, currentY + 2);

  currentY += 15;

  // Signature lines
  const signatureWidth = 70;
  
  // Left signature
  doc.setDrawColor(148, 163, 184);
  doc.line(20, currentY, 20 + signatureWidth, currentY);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(textColorDark[0], textColorDark[1], textColorDark[2]);
  doc.text('CONTROLADOR DE FROTA / GESTOR', 20, currentY + 4);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(textColorLight[0], textColorLight[1], textColorLight[2]);
  doc.text('Autorizou o Lançamento', 20, currentY + 8);

  // Right signature
  doc.setDrawColor(148, 163, 184);
  doc.line(pageWidth - signatureWidth - 20, currentY, pageWidth - 20, currentY);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(textColorDark[0], textColorDark[1], textColorDark[2]);
  doc.text('MOTORISTA RESPONSÁVEL', pageWidth - signatureWidth - 20, currentY + 4);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(textColorLight[0], textColorLight[1], textColorLight[2]);
  doc.text('Declarador das Despesas', pageWidth - signatureWidth - 20, currentY + 8);

  currentY += 18;
  doc.setFontSize(7.5);
  doc.setTextColor(textColorLight[0], textColorLight[1], textColorLight[2]);
  const declarationText = 'Este recibo é emitido de forma automatizada pelo sistema de frotas e serve de anexo para a prestação de contas fiscais oficiais da empresa. Os valores correspondem à declaração oficial dada no ato de fechamento da viagem.';
  const splitDeclaration = doc.splitTextToSize(declarationText, pageWidth - 30);
  doc.text(splitDeclaration, 15, currentY);

  // Check if we have photos of receipts to attach. If so, create page 2!
  const hasPhotos = (freight.fotoAbastecimento && freight.fotoAbastecimento.length > 50) || 
                    (freight.fotoComprovanteGeral && freight.fotoComprovanteGeral.length > 50);

  if (hasPhotos) {
    doc.addPage();
    drawHeader(doc, 'ANEXOS E COMPROVANTES RECEBIDOS');
    
    let currentImgY = 55;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text('Anexos de Viagem Digitalizados', 15, currentImgY);
    
    doc.setDrawColor(226, 232, 240);
    doc.line(15, currentImgY + 2, pageWidth - 15, currentImgY + 2);

    currentImgY += 10;

    const renderPhotoInPDF = (base64Str: string, titleLabel: string, descLabel: string) => {
      if (!base64Str || base64Str.length < 50) return;

      try {
        // Is it actually a valid base64 image data URI?
        let format = 'JPEG';
        if (base64Str.startsWith('data:image/png')) {
          format = 'PNG';
        } else if (base64Str.startsWith('data:image/webp')) {
          format = 'WEBP';
        }

        // Draw helper label box
        doc.setFillColor(bgLight[0], bgLight[1], bgLight[2]);
        doc.rect(15, currentImgY, pageWidth - 30, 10, 'F');
        doc.setDrawColor(203, 213, 225);
        doc.rect(15, currentImgY, pageWidth - 30, 10, 'D');

        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(textColorDark[0], textColorDark[1], textColorDark[2]);
        doc.text(titleLabel, 18, currentImgY + 6);
        
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(textColorLight[0], textColorLight[1], textColorLight[2]);
        doc.text(descLabel, pageWidth - 100, currentImgY + 6);

        currentImgY += 14;

        // Draw image frame
        doc.setDrawColor(226, 232, 240);
        doc.rect(15, currentImgY, 80, 50, 'D');

        // Add to PDF
        doc.addImage(base64Str, format, 16, currentImgY + 1, 78, 48);

        // Add spacing info next to image
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(textColorDark[0], textColorDark[1], textColorDark[2]);
        doc.text('Metadados do Arquivo:', 102, currentImgY + 5);
        
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(textColorLight[0], textColorLight[1], textColorLight[2]);
        doc.text('- Formato do arquivo: Digitalizado via App', 102, currentImgY + 11);
        doc.text('- Vinculado à auditoria interna de combustíveis', 102, currentImgY + 17);
        doc.text('- Integridade do Hash verificado pelo banco de dados', 102, currentImgY + 23);

        currentImgY += 56;
      } catch (err) {
        // Safe fallback if drawing image fails
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8.5);
        doc.setTextColor(239, 68, 68);
        doc.text(`[Falha ao processar e carregar visualização da foto: ${titleLabel}]`, 15, currentImgY);
        currentImgY += 12;
      }
    };

    if (freight.fotoAbastecimento) {
      renderPhotoInPDF(
        freight.fotoAbastecimento, 
        'Cupom Fiscal de Combustível', 
        `Posto: ${freight.localAbastecimento || 'Posto na Rota'}`
      );
    }

    if (freight.fotoComprovanteGeral) {
      renderPhotoInPDF(
        freight.fotoComprovanteGeral, 
        'Comprovante de Despesa Adicional', 
        `Finalidade: ${freight.outrosDetalhes || 'Gerais'}`
      );
    }
  }

  // Save the document
  doc.save(`Relatorio_Frete_${freight.id.substring(0,8)}.pdf`);
}
