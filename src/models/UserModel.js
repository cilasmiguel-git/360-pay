import mongoose from "mongoose";
import { userConn } from "../config/db.js";

/* ------------------ Subdocs ------------------ */

// Desconto padrão
const DescontoDevedorSchema = new mongoose.Schema({
  tipo: { type: String, enum: ["valor", "percentual"], required: true, default: "valor" },
  valor: { type: Number, required: true, min: [0, "O valor do desconto não pode ser negativo."] },
  motivo: { type: String },
  inicio: { type: Date, default: null },
  fim: { type: Date, default: null },
  ativo: { type: Boolean, required: true, default: true },
}, { _id: false });

// Mensalidade escolar (apenas para alunos REGULARES)
const MensalidadeAlunoSchema = new mongoose.Schema({
  vencimentoDia: { type: Number, min: 1, max: 31, default: null },
  descontoDevedor: { type: DescontoDevedorSchema, default: null },
}, { _id: false });

// Flags acadêmicas (controlam boletim/frequência)
const AlunoAcademicoFlagsSchema = new mongoose.Schema({
  geraBoletim: { type: Boolean, default: true },
  geraFrequencia: { type: Boolean, default: true },
}, { _id: false });

// Histórico de séries e turnos de anos anteriores
const HistoricoAcademicoSchema = new mongoose.Schema({
  anoLetivo: { type: Number, required: true },
  serie: { type: String, required: true },
  turno: { type: String, required: true },
  situacao: { type: String, enum: ["aprovado", "reprovado", "transferido", "cursando"], default: "cursando" },
}, { _id: false });

// Contratos/serviços financeiros (vale para ALUNO ou CLIENTE)
const ContratoServicoSchema = new mongoose.Schema({
  tipo: { type: String, enum: ["escolar", "esporte", "reforco", "creche-diaria", "outro"], required: true },
  descricao: { type: String, required: true },
  tipoCobrancaId: { type: mongoose.Schema.Types.ObjectId, ref: "TipoCobranca" },
  valorBase: { type: Number, required: true, min: 0 },
  vencimentoDia: { type: Number, min: 1, max: 31, default: null },
  descontoDevedor: {
    tipo: { type: String, enum: ["valor", "percentual"], default: "valor" },
    valor: { type: Number, min: 0, default: 0 },
    motivo: { type: String },
    inicio: { type: Date, default: null },
    fim: { type: Date, default: null },
    ativo: { type: Boolean, default: true },
  },
  inicio: { type: Date, default: null },
  fim: { type: Date, default: null },
  ativo: { type: Boolean, default: true },
}, { _id: true, timestamps: true });

/* ------------------ User schema ------------------ */

const userSchema = new mongoose.Schema({
  // Papeis
  isAdminMaster: { type: Boolean, required: true, default: false },
  isAdmin: { type: Boolean, required: true, default: false },
  isCoordenaçao: { type: Boolean, required: true, default: false },
  isSecretaria: { type: Boolean, required: true, default: false },
  isNutricionista: { type: Boolean, required: true, default: false },
  isProfessor: { type: Boolean, required: true, default: false },
  isResponsavel: { type: Boolean, required: true, default: false },
  isAluno: { type: Boolean, required: true, default: false },
  isCliente: { type: Boolean, required: false, default: false },
  isCreche: { type: Boolean, required: true, default: false },
  isGestao: { type: Boolean, required: true, default: false },
  perms: { type: [String], default: [] },

  firstName: { type: String, required: true },
  lastName: { type: String, required: true },

  dataNascimento: {
    type: Date, default: null,
    validate: {
      validator: function (v) {
        if (!v) return true;
        const agora = new Date();
        const ano1800 = new Date("1800-01-01");
        return v <= agora && v >= ano1800;
      },
      message: "Data de nascimento inválida.",
    },
  },

  email: {
    type: String,
    unique: true,
    sparse: true,
    validate: {
      validator: function (value) {
        return this.isAluno || this.isCliente || (value && value.length > 0);
      },
      message: "O campo 'email' é obrigatório para usuários que não são alunos nem clientes.",
    },
  },

  CPF: {
    type: String,
    required: function () { return !(this.isAluno || this.isCliente); },
    unique: true,
    sparse: true,
    validate: {
      validator: function (v) { return !v || /^\d{11}$/.test(v); },
      message: (props) => `${props.value} não é um CPF válido! Deve ter exatamente 11 dígitos.`,
    },
  },

  img: { type: String },

  phoneNumber: {
    type: String,
    validate: {
      validator: function (value) {
        return this.isAluno || this.isCliente || (value && value.length === 13);
      },
      message: "O campo 'phoneNumber' é obrigatório para usuários que não são alunos nem clientes e deve ter 9 dígitos.",
    },
  },

  password: { type: String, required: true },
  tenantId: { type: String, required: true },

  professorInfo: [{
    serie: { type: String },
    turno: { type: String },
  }],

  responsavelInfo: [{
    nomeAluno: { type: String },
    serie: { type: String },
    turno: { type: String },
    CPF: {
      type: String,
      validate: {
        validator: function (v) { return !v || /^\d{11}$/.test(v); },
        message: (props) => `${props.value} não é um CPF válido! Deve ter exatamente 11 dígitos.`,
      },
    },
  }],

  // Dados acadêmicos (só faz sentido para aluno)
  alunoInfo: {
    type: {
      serie: { type: String },
      turno: { type: String },
      historico: { type: [HistoricoAcademicoSchema], default: [] },
      mensalidade: { type: MensalidadeAlunoSchema, default: null },
      academico: { type: AlunoAcademicoFlagsSchema, default: undefined },
    },
    default: null,
  },

  // NOVO: dados de cliente (não acadêmico)
  clienteInfo: {
    type: {
      tipo: { type: String, enum: ["esporte", "reforco", "creche-diaria", "outro"], default: "outro" },
      observacoes: { type: String },
      codigoCliente: { type: String, unique: true, sparse: true },
    },
    default: null,
  },

  // Financeiro comum
  contratosServicos: { type: [ContratoServicoSchema], default: [] },

  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },

  abacateCustomerId: { type: String, sparse: true },

  matricula: { type: String, unique: true, sparse: true },

  endereco: {
    cep: { type: String },
    logradouro: { type: String },
    numero: { type: String },
    complemento: { type: String },
    bairro: { type: String },
    municipio: { type: String },
    uf: { type: String },
  },

  descontosPorCobranca: [{
    tipoCobrancaId: { type: mongoose.Schema.Types.ObjectId, ref: "TipoCobranca", required: true },
    valorComDesconto: { type: Number, required: true },
    motivoDesconto: { type: String },
  }],

  configuracoes: {
    notifications: {
      receberNotas: { type: Boolean, default: false },
      receberAgenda: { type: Boolean, default: false },
      receberInformes: { type: Boolean, default: false },
      receberCardapio: { type: Boolean, default: false },
      receberRoteiro: { type: Boolean, default: false },
    },
    darkMode: { type: Boolean, default: false },
  },

  status: { type: String, enum: ["active", "archived"], default: "active", index: true },
  archivedAt: { type: Date, default: null },
  archivedReason: { type: String, default: null },

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

/* ------------------ Regras & Middlewares ------------------ */

userSchema.pre("save", function (next) {
  if (this.isCliente) {
    if (this.isAluno) {
      this.isAluno = false;
      this.alunoInfo = null;
      this.matricula = undefined;
    }
  }

  const d = this.alunoInfo?.mensalidade?.descontoDevedor || null;
  if (d) {
    if (d.tipo === "percentual" && (typeof d.valor !== "number" || d.valor < 0 || d.valor > 100))
      return next(new Error("Para desconto percentual, 'valor' deve estar entre 0 e 100."));
    if (d.tipo === "valor" && (typeof d.valor !== "number" || d.valor < 0))
      return next(new Error("Para desconto em valor, 'valor' deve ser >= 0."));
    if (d.inicio && d.fim && d.inicio > d.fim)
      return next(new Error("No desconto do devedor: 'inicio' não pode ser maior que 'fim'."));
  }

  (this.contratosServicos || []).forEach((c) => {
    const dc = c.descontoDevedor;
    if (!dc) return;
    if (dc.tipo === "percentual" && (typeof dc.valor !== "number" || dc.valor < 0 || dc.valor > 100))
      return next(new Error("No contrato: para desconto percentual, 'valor' deve estar entre 0 e 100."));
    if (dc.tipo === "valor" && (typeof dc.valor !== "number" || dc.valor < 0))
      return next(new Error("No contrato: para desconto em valor, 'valor' deve ser >= 0."));
    if (dc.inicio && dc.fim && dc.inicio > dc.fim)
      return next(new Error("No contrato: 'inicio' não pode ser maior que 'fim'."));
  });

  next();
});

// A lógica do PRE SAVE que gera código não precisamos trazer toda se o API Payment não vai criar usuários.
// Mas mantemos os métodos virtuais de desconto que são ESSENCIAIS.

/* ------------------ Virtuals & Métodos ------------------ */

// Desconto da mensalidade escolar (aluno regular)
userSchema.methods.aplicarDescontoMensalidade = function (base) {
  const mensalidade = this.alunoInfo?.mensalidade || null;
  const d = mensalidade?.descontoDevedor || null;
  if (!base || !d || !d.ativo) return base;

  const hoje = new Date();
  if (d.inicio && hoje < d.inicio) return base;
  if (d.fim && hoje > d.fim) return base;

  if (d.tipo === "percentual") return Math.max(0, base - (base * d.valor) / 100);
  return Math.max(0, base - d.valor);
};

// Desconto em contratos (cliente ou aluno)
userSchema.methods.aplicarDescontoContrato = function (contratoId, base) {
  const c = (this.contratosServicos || []).find((x) => String(x._id) === String(contratoId));
  if (!c || !c.ativo || !base) return base;

  const d = c.descontoDevedor;
  if (!d || !d.ativo) return base;

  const hoje = new Date();
  if (d.inicio && hoje < d.inicio) return base;
  if (d.fim && hoje > d.fim) return base;

  if (d.tipo === "percentual") return Math.max(0, base - (base * d.valor) / 100);
  return Math.max(0, base - d.valor);
};

const User = userConn.model("User", userSchema);
export default User;
