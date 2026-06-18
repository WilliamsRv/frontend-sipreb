import React from 'react';
import { Text, View, Document, StyleSheet } from '@react-pdf/renderer';
import {
    ReportPage,
    MetaSection,
    TableHeader,
    TableRow,
    TableCell,
    COLORS,
    formatDateTime,
} from '../../../shared/reports';
import siprebLogo from '../components/categoria/logo-sipreb.png';

const styles = StyleSheet.create({
    summaryText: {
        marginTop: 10,
        fontSize: 9,
        color: COLORS.SLATE_600,
        marginBottom: 8,
    },
    rowText: {
        fontSize: 9,
        color: COLORS.SLATE_800,
    },
    booleanTrue: {
        color: COLORS.CYAN,
        fontWeight: 'bold',
    },
    booleanFalse: {
        color: COLORS.SLATE_600,
        fontWeight: 'bold',
    },
    tableContainer: {
        marginTop: 8,
    },
    detailSection: {
        marginTop: 12,
        backgroundColor: '#f8fafc',
        borderRadius: 8,
        padding: 12,
    },
    detailHeading: {
        fontSize: 11,
        fontWeight: 'bold',
        color: COLORS.NAVY,
        marginBottom: 10,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        borderBottomWidth: 1,
        borderBottomColor: COLORS.SLATE_200,
        paddingVertical: 8,
    },
    detailLabel: {
        width: '40%',
        fontSize: 8,
        color: COLORS.SLATE_600,
        fontWeight: 'bold',
        textTransform: 'uppercase',
    },
    detailValue: {
        width: '58%',
        fontSize: 9,
        color: COLORS.SLATE_800,
    },
    badge: {
        fontSize: 9,
        fontWeight: 'bold',
    },
});

const detailStyles = StyleSheet.create({
    metaRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingBottom: 12,
        marginBottom: 20,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.SLATE_200,
    },
    metaLabel: {
        fontSize: 7,
        color: COLORS.SLATE_400,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 2,
    },
    metaValue: {
        fontSize: 8,
        color: COLORS.SLATE_600,
        fontWeight: 'bold',
    },
    sectionWrap: {
        marginBottom: 16,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        borderLeftWidth: 4,
        borderLeftColor: COLORS.CYAN,
        paddingLeft: 8,
        paddingVertical: 4,
        marginBottom: 6,
    },
    sectionTitle: {
        fontSize: 8,
        fontWeight: 'bold',
        color: COLORS.CYAN,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
    },
    sectionDivider: {
        borderBottomWidth: 1,
        borderBottomColor: COLORS.SLATE_200,
        marginBottom: 4,
    },
    fieldRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 7,
        minHeight: 26,
    },
    fieldLabel: {
        width: '38%',
        fontSize: 8,
        color: COLORS.SLATE_600,
    },
    fieldValue: {
        width: '62%',
        fontSize: 9,
        color: COLORS.SLATE_800,
    },
});

const DetailField = ({ label, value, shade }) => (
    <View style={[detailStyles.fieldRow, { backgroundColor: shade ? '#f1f5f9' : '#ffffff' }]}>
        <Text style={detailStyles.fieldLabel}>{label}</Text>
        <Text style={detailStyles.fieldValue}>{value || '—'}</Text>
    </View>
);

const DetailSection = ({ title, children }) => (
    <View style={detailStyles.sectionWrap}>
        <View style={detailStyles.sectionHeader}>
            <Text style={detailStyles.sectionTitle}>{title}</Text>
        </View>
        <View style={detailStyles.sectionDivider} />
        {children}
    </View>
);

const fmtDate = (value) => {
    if (!value) return '—';
    return new Intl.DateTimeFormat('es-PE', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(value));
};

const CategoryReport = ({ categorias = [], allCategories = [], entity = 'Municipalidad', muniLogo = null }) => {
    const parentById = allCategories.reduce((acc, category) => {
        acc[category.id] = category.name;
        return acc;
    }, {});
    
    const logoSrc = muniLogo || siprebLogo;

    const columns = [
        { label: 'Código', width: '10%' },
        { label: 'Nombre', width: '15%' },
        { label: 'Descripción', width: '20%' },
        { label: 'Categoría Padre', width: '15%' },
        { label: 'Nivel', width: '8%' },
        { label: 'Inventariable', width: '10%' },
        { label: 'Requiere Serie', width: '11%' },
        { label: 'Requiere Placa', width: '11%' },
    ];

    return (
        <Document>
            <ReportPage
                logo={logoSrc}
                title="Reporte Detallado de Categorías"
                subtitle="Listado completo de categorías del sistema"
                muniName={entity}
                year={new Date().getFullYear()}
            >
                <MetaSection
                    entity={entity}
                    office="Gestión de Categorías"
                    dateStr={formatDateTime(new Date())}
                />

                <Text style={styles.summaryText}>Total de registros: {categorias.length}</Text>

                <View style={styles.tableContainer}>
                    <TableHeader columns={columns} />
                    {categorias.map((cat, index) => (
                        <TableRow key={cat.id || index} index={index}>
                            <TableCell width={columns[0].width}>
                                <Text style={styles.rowText}>{cat.categoryCode || '—'}</Text>
                            </TableCell>
                            <TableCell width={columns[1].width}>
                                <Text style={styles.rowText}>{cat.name || '—'}</Text>
                            </TableCell>
                            <TableCell width={columns[2].width}>
                                <Text style={styles.rowText}>{cat.description || '—'}</Text>
                            </TableCell>
                            <TableCell width={columns[3].width}>
                                <Text style={styles.rowText}>
                                    {cat.parentCategoryId ? parentById[cat.parentCategoryId] || '—' : 'Ninguno'}
                                </Text>
                            </TableCell>
                            <TableCell width={columns[4].width}>
                                <Text style={styles.rowText}>{cat.level ?? '—'}</Text>
                            </TableCell>
                            <TableCell width={columns[5].width}>
                                <Text style={cat.isInventoriable ? styles.booleanTrue : styles.booleanFalse}>
                                    {cat.isInventoriable ? 'Sí' : 'No'}
                                </Text>
                            </TableCell>
                            <TableCell width={columns[6].width}>
                                <Text style={cat.requiresSerial ? styles.booleanTrue : styles.booleanFalse}>
                                    {cat.requiresSerial ? 'Sí' : 'No'}
                                </Text>
                            </TableCell>
                            <TableCell width={columns[7].width}>
                                <Text style={cat.requiresPlate ? styles.booleanTrue : styles.booleanFalse}>
                                    {cat.requiresPlate ? 'Sí' : 'No'}
                                </Text>
                            </TableCell>
                        </TableRow>
                    ))}
                </View>
            </ReportPage>
        </Document>
    );
};

export const CategoryDetailReport = ({ category = {}, allCategories = [], entity = 'Municipalidad', muniLogo = null }) => {
    const logoSrc = muniLogo || siprebLogo;
    const parentName = category.parentCategoryId
        ? allCategories.find((item) => item.id === category.parentCategoryId)?.name || '—'
        : 'Ninguno';

    return (
        <Document>
            <ReportPage
                logo={logoSrc}
                title="Detalle de Categoría"
                subtitle={category.name || 'Sin Nombre'}
                muniName={entity}
                year={new Date().getFullYear()}
            >
                <View style={detailStyles.metaRow}>
                    <View>
                        <Text style={detailStyles.metaLabel}>Entidad</Text>
                        <Text style={detailStyles.metaValue}>{entity}</Text>
                        <Text style={[detailStyles.metaLabel, { marginTop: 6 }]}>Oficina</Text>
                        <Text style={detailStyles.metaValue}>Gestión de Categorías</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                        <Text style={detailStyles.metaLabel}>Fecha de generación</Text>
                        <Text style={detailStyles.metaValue}>{fmtDate(new Date())}</Text>
                    </View>
                </View>

                <DetailSection title="Identificación">

                    <DetailField label="Código" value={category.categoryCode} shade={false} />
                    <DetailField label="Categoría padre" value={parentName} shade={true} />
                    <DetailField label="Nivel" value={category.level ?? '—'} shade={false} />
                </DetailSection>

                <DetailSection title="Información general">
                    <DetailField label="Nombre" value={category.name} shade={false} />
                    <DetailField label="Descripción" value={category.description} shade={true} />
                </DetailSection>

                <DetailSection title="Configuración">
                    <DetailField label="Inventariable" value={category.isInventoriable ? 'Sí' : 'No'} shade={false} />
                    <DetailField label="Requiere serie" value={category.requiresSerial ? 'Sí' : 'No'} shade={true} />
                    <DetailField label="Requiere placa" value={category.requiresPlate ? 'Sí' : 'No'} shade={false} />
                </DetailSection>

                <DetailSection title="Sistema">
                    <DetailField label="Fecha de generación" value={fmtDate(new Date())} shade={false} />
                    <DetailField label="Estado" value={category.active ? 'Activa' : 'Inactiva'} shade={true} />
                </DetailSection>
            </ReportPage>
        </Document>
    );
};

export default CategoryReport;