
/**
 * Formata uma data para o locale pt-BR usando o fuso horário local do usuário
 */
export function formatDate(dateString: string | null | undefined): string {
    if (!dateString)
        return 'N/A'

    try {
        const date = new Date(dateString)

        // Check if date is valid
        if (isNaN(date.getTime())) return 'Data inválida'

        return new Intl.DateTimeFormat('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        }).format(date)
    } catch (e) {
        return 'Data inválida'
    }
}

/**
 * Formata o tempo decorrido (ex: "5m atrás")
 */
export function formatTimeAgo(dateString: string | null | undefined): string {
    if (!dateString) return ''

    try {
        const now = new Date()
        const date = new Date(dateString)
        const diffMs = now.getTime() - date.getTime()
        const diffMinutes = Math.floor(diffMs / (1000 * 60))
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

        if (diffMinutes < 1)
            return 'Agora mesmo'
        if (diffMinutes < 60)
            return `${diffMinutes}m atrás`
        if (diffHours < 24)
            return `${diffHours}h atrás`
        return `${diffDays}d atrás`
    } catch (e) {
        return ''
    }
}
