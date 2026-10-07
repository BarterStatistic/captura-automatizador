// Íconos de trazo, del mismo grosor y tamaño, para que el vocabulario visual sea
// uno solo. Heredan el color del texto.

function Icono({ children, tamano = 16, ...resto }) {
  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...resto}
    >
      {children}
    </svg>
  );
}

export const IconoCheck = (p) => (
  <Icono {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icono>
);

export const IconoAlerta = (p) => (
  <Icono {...p}>
    <path d="M12 8v5" />
    <path d="M12 16.5v.5" />
    <circle cx="12" cy="12" r="9" />
  </Icono>
);

export const IconoSubir = (p) => (
  <Icono {...p}>
    <path d="M12 15V4" />
    <path d="M7.5 8.5L12 4l4.5 4.5" />
    <path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" />
  </Icono>
);

export const IconoDocumento = (p) => (
  <Icono {...p}>
    <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
    <path d="M14 3v5h5" />
  </Icono>
);

export const IconoCerrar = (p) => (
  <Icono {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icono>
);

export const IconoReintentar = (p) => (
  <Icono {...p}>
    <path d="M20 11a8 8 0 10-2.3 5.7" />
    <path d="M20 5v6h-6" />
  </Icono>
);

export const IconoCopiar = (p) => (
  <Icono {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V6a2 2 0 012-2h9" />
  </Icono>
);

export const IconoFlecha = (p) => (
  <Icono {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icono>
);

export const IconoCandado = (p) => (
  <Icono {...p}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 018 0v3" />
  </Icono>
);

export const IconoImpresora = (p) => (
  <Icono {...p}>
    <path d="M7 9V4h10v5" />
    <rect x="3" y="9" width="18" height="8" rx="2" />
    <path d="M7 14h10v6H7z" />
  </Icono>
);
